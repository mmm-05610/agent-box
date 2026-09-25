import json
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

from decision_queue import Queue, clip, now, freshness, cell_width, mouse_intent
import curses


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.q = Queue(Path(self.tmp.name))
        self.r = dict(id='D-001', title='选择方案', question='怎么做？', recommendation='方案A',
                      alternatives='方案B', impact='只影响测试', evidence='source.py:10')

    def test_submit_and_render(self):
        self.q.submit(self.r)
        text = (self.q.mission / 'USER-DECISIONS.md').read_text()
        self.assertIn('待回答 1 项', text)
        self.assertIn('用户回答', text)

    def test_idempotent_and_conflict(self):
        self.q.submit(self.r)
        self.q.submit(self.r)
        self.assertEqual(len(self.q.snapshot()[0]), 1)
        with self.assertRaises(ValueError):
            self.q.submit(dict(self.r, question='不同问题'))

    def test_answers_and_revisions(self):
        self.q.submit(self.r)
        self.q.answer('D-001', '同意A\n不扩大范围')
        self.q.answer('D-001', '修正：选B')
        records, errors = self.q.snapshot()
        self.assertFalse(errors)
        self.assertEqual(len(records[0]['answers']), 2)
        self.assertEqual(records[0]['answers'][-1]['text'], '修正：选B')

    def test_reject_bad_inputs(self):
        for rid in ('../oops', '/tmp/oops', ''):
            with self.assertRaises(ValueError):
                self.q.submit(dict(self.r, id=rid))
        with self.assertRaises(ValueError):
            self.q.answer('unknown', 'yes')
        with self.assertRaises(ValueError):
            self.q.submit(dict(self.r, impact=''))

    def test_tampering_invalidates_answer(self):
        self.q.submit(self.r)
        self.q.answer('D-001', 'yes')
        path = self.q.root / 'requests/D-001.json'
        data = json.loads(path.read_text())
        data['question'] = '偷偷改题'
        path.write_text(json.dumps(data))
        records, errors = self.q.snapshot()
        self.assertTrue(errors)
        self.assertFalse(records[0]['answers'])

    def test_broken_request_does_not_hide_good_request(self):
        self.q.submit(self.r)
        (self.q.root / 'requests/broken.json').write_text('{')
        records, errors = self.q.snapshot()
        self.assertEqual(len(records), 1)
        self.assertEqual(len(errors), 1)

    def test_concurrent_submissions(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda n: self.q.submit(dict(self.r, id=f'D-{n}')), range(16)))
        self.assertEqual(len(self.q.snapshot()[0]), 16)
        self.assertIn('待回答 16 项', (self.q.mission / 'USER-DECISIONS.md').read_text())

    def test_no_rewrite_when_unchanged(self):
        self.q.submit(self.r)
        path = self.q.mission / 'USER-DECISIONS.md'
        before = path.stat().st_mtime_ns
        with self.q.locked():
            self.q.render()
        self.assertEqual(before, path.stat().st_mtime_ns)

    def test_unicode_and_control(self):
        self.assertEqual(clip('中文abc', 5), '中文a')
        self.assertNotIn('\x1b', clip('a\x1bb', 20))

    def test_mouse_targets_use_terminal_cells(self):
        self.assertEqual(cell_width('[ 返回 ]'), 8)
        targets = [(5, 10, 18, 'back')]
        self.assertEqual(mouse_intent(11, 5, curses.BUTTON1_PRESSED, targets), 'back')
        self.assertIsNone(mouse_intent(18, 5, curses.BUTTON1_PRESSED, targets))
        self.assertIsNone(mouse_intent(11, 6, curses.BUTTON1_PRESSED, targets))

    def test_wheel_does_not_click_a_card(self):
        targets = [(5, 0, 80, 'show D-001')]
        self.assertEqual(mouse_intent(10, 5, curses.BUTTON4_PRESSED, targets), 'up')
        if hasattr(curses, 'BUTTON5_PRESSED'):
            self.assertEqual(mouse_intent(10, 5, curses.BUTTON5_PRESSED, targets), 'down')

    def cp(self, **changes):
        base = dict(id='CP-SESSION-001', revision=1, status='IN_PROGRESS',
                    summary='前端已集成，后端仍接线', next='完成原生接线', evidence='报告路径',
                    modules=[dict(name='前端', status='DONE', summary='会话输入已接入'),
                             dict(name='后端', status='IN_PROGRESS', summary='原生执行接线中')])
        base.update(changes)
        return base

    def test_checkpoint_replaces_not_appends(self):
        self.q.submit(self.r)
        self.q.answer('D-001', '批准')
        self.q.publish_checkpoint(self.cp())
        self.q.publish_checkpoint(self.cp(revision=2, summary='第二次最新状态'))
        self.assertEqual(len(self.q.snapshot()[0]), 1)
        self.assertEqual(len(self.q.snapshot()[0][0]['answers']), 1)
        text = (self.q.mission / 'USER-DECISIONS.md').read_text()
        self.assertIn('第二次最新状态', text)
        self.assertNotIn('前端已集成，后端仍接线', text)
        self.assertIn('会话输入已接入', text)

    def test_checkpoint_revision_and_idempotency(self):
        self.q.publish_checkpoint(self.cp())
        first = self.q.checkpoint()
        self.q.publish_checkpoint(self.cp())
        self.assertEqual(first, self.q.checkpoint())
        with self.assertRaises(ValueError):
            self.q.publish_checkpoint(self.cp(summary='陈旧覆盖'))

    def test_checkpoint_ready_requires_modules_and_entry(self):
        with self.assertRaises(ValueError):
            self.q.publish_checkpoint(self.cp(status='READY_FOR_USER_REVIEW'))
        with self.assertRaises(ValueError):
            self.q.publish_checkpoint(self.cp(status='READY_FOR_USER_REVIEW', try_it='启动命令'))
        cp = self.cp(status='READY_FOR_USER_REVIEW', try_it='启动命令',
                     modules=[dict(name='整机', status='DONE', summary='真实闭环通过，等用户验收')])
        self.q.publish_checkpoint(cp)
        self.assertIn('可开始验收', '\n'.join(self.q.checkpoint_lines()))

    def test_checkpoint_rejects_hash_only_and_corruption_visible(self):
        with self.assertRaises(ValueError):
            self.q.publish_checkpoint(self.cp(modules=[dict(name='前端', status='DONE', summary='abc12345')]))
        (self.q.root / 'checkpoint-latest.json').write_text('{')
        with self.q.locked():
            self.q.render()
        self.assertIn('检查点数据异常', (self.q.mission / 'USER-DECISIONS.md').read_text())

    def layered(self):
        cp = self.cp()
        cp.pop('modules')
        cp['sections'] = []
        for name in ('frontend', 'backend', 'integration'):
            module = dict(name=name+'模块', status='IN_PROGRESS', summary='接线进行中', owner='负责人',
                          done='已提交接口', doing='接线', next='联调', blockers='暂无', evidence='report.md', observed_at=now())
            cp['sections'].append(dict(id=name, name=name, status='IN_PROGRESS', summary='阶段在施工',
                                       next='验证', blockers='暂无', evidence='status.md', observed_at=now(), modules=[module]))
        return cp

    def test_layered_navigation_and_document(self):
        self.q.publish_checkpoint(self.layered())
        front = '\n'.join(self.q.checkpoint_lines('frontend', live=True))
        self.assertIn('frontend模块', front)
        self.assertNotIn('backend模块', front)
        self.assertIn('已完成', front)
        self.assertIn('正在做', front)
        self.assertIn('分钟前核实', front)
        text = (self.q.mission / 'USER-DECISIONS.md').read_text()
        self.assertIn('### frontend', text)
        self.assertIn('#### 1. backend模块', text)

    def test_layered_requires_details_and_consistency(self):
        cp = self.layered()
        del cp['sections'][0]['modules'][0]['blockers']
        with self.assertRaises(ValueError):
            self.q.publish_checkpoint(cp)
        cp = self.layered()
        cp['sections'][0]['status'] = 'DONE'
        with self.assertRaises(ValueError):
            self.q.publish_checkpoint(cp)

    def test_staleness(self):
        self.assertIn('超过5分钟', freshness('2000-01-01T00:00:00+00:00'))
        self.assertNotIn('超过5分钟', freshness(now()))
        self.assertIn('尚无有效', freshness('bad'))

    def extension(self, name='provider', **changes):
        data = self.cp(id=name, modules=self.layered()['sections'][0]['modules'])
        data.update(changes)
        return data

    def test_extensions_independent_from_main_and_each_other(self):
        self.q.publish_checkpoint(self.cp(status='READY_FOR_USER_REVIEW', try_it='run',
            modules=[dict(name='主线', status='DONE', summary='闭环已实测')]))
        before = self.q.checkpoint()
        self.q.publish_extension(self.extension())
        self.q.publish_extension(self.extension('profile'))
        self.q.publish_extension(self.extension(revision=2, summary='Provider新进展'))
        self.assertEqual(before, self.q.checkpoint())
        self.assertEqual(self.q.snapshot()[0], [])
        self.assertIn('Provider新进展', '\n'.join(self.q.checkpoint_lines('extensions')))
        self.assertEqual(json.loads((self.q.root / 'extension-profile.json').read_text())['revision'], 1)
        self.assertIn('拓展', (self.q.mission / 'USER-DECISIONS.md').read_text())

    def test_extension_rejects_stale_bad_owner_and_missing_details(self):
        data = self.extension()
        self.q.publish_extension(data)
        self.q.publish_extension(data)
        with self.assertRaises(ValueError):
            self.q.publish_extension(self.extension(summary='陈旧'))
        with self.assertRaises(ValueError):
            self.q.publish_extension(self.extension('../bad'))
        del data['modules'][0]['doing']
        with self.assertRaises(ValueError):
            self.q.publish_extension(data)

    def test_extension_corruption_is_visible(self):
        (self.q.root / 'extension-provider.json').write_text('{')
        self.assertIn('数据异常', '\n'.join(self.q.extension_lines()))
        self.assertIn('尚未收到', '\n'.join(self.q.extension_lines()))


if __name__ == '__main__':
    unittest.main()
