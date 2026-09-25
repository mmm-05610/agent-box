import tempfile
import unittest
from pathlib import Path
from project_feed import ProjectFeed


class FeedTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.feed = ProjectFeed(self.root)

    def write(self, name, body):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
        return path

    def test_normal_message_visible_without_publication(self):
        self.write('agents/BC/outbox/BC-1.md', '# 原生两轮成功\n不是 Server 闭环')
        text = '\n'.join(self.feed.lines('backend'))
        self.assertIn('原生两轮成功', text)
        self.assertIn('不是 Server 闭环', text)
        self.assertFalse((self.root / 'decision-queue').exists())

    def test_new_message_does_not_overwrite_old_status(self):
        self.write('agents/BC/status.md', 'blocked: 旧原因')
        self.write('agents/BC/outbox/BC-2.md', '# 修正原因\n新证据')
        text = '\n'.join(self.feed.lines('backend'))
        self.assertIn('旧状态可能滞后', text)
        self.assertIn('旧原因', text)
        self.assertIn('新证据', text)

    def test_update_invalidation_and_deleted_source(self):
        path = self.write('agents/H/outbox/H-1.md', '# 原文')
        self.feed.scan(force=True)
        path.write_text('# 已修订更长正文')
        self.feed.scan(force=True)
        self.assertIn('已修订', '\n'.join(self.feed.lines('backend')))
        path.unlink()
        self.feed.scan(force=True)
        self.assertFalse(self.feed.items)

    def test_no_duplicate_inbox_no_arbitrary_open(self):
        self.write('agents/H/outbox/H-1.md', '# hello')
        self.write('agents/C/inbox/H-1.md', '# hello')
        self.assertEqual(len(self.feed.scan()), 1)
        self.assertIn('未找到', self.feed.detail('../../secret')[0])

    def test_symlink_and_invalid_utf8_reported(self):
        self.write('outside.md', 'not a coordination record')
        path = self.write('agents/H/outbox/H-1.md', '')
        path.unlink()
        path.symlink_to(self.root / 'outside.md')
        self.write('agents/C/status.md', '').write_bytes(b'\xff')
        self.assertFalse(self.feed.scan())
        self.assertEqual(len(self.feed.errors), 2)

    def test_decision_reference_is_not_execution(self):
        self.write('agents/C/outbox/C-1.md', '# ACK D-001\n尚未执行；等待 D-0010')
        records = [dict(id='D-001', title='许可', answers=[dict(text='同意')])]
        text = '\n'.join(self.feed.lines('decisions', records))
        self.assertIn('尚无明确执行核验', text)
        self.assertIn('关联回执 1 件', text)
        records[0]['id'] = 'D-00'
        self.assertIn('关联回执 0 件', '\n'.join(self.feed.lines('decisions', records)))

    def test_issues_are_not_claimed_active(self):
        self.write('agents/H/outbox/H-1.md', '# 旧失败已解决\n已修复历史阻塞')
        text = '\n'.join(self.feed.lines('issues'))
        self.assertIn('未自动判定开/闭', text)
        self.assertIn('已修复历史阻塞', text)

    def test_extensions_not_integrated(self):
        self.write('agents/PROFILE/outbox/P-1.md', '# 独立完成')
        self.assertIn('不计入主线', '\n'.join(self.feed.lines('overview')))
        self.assertNotIn('独立完成', '\n'.join(self.feed.lines('integration')))

    def test_overview_is_short_and_does_not_dump_reports(self):
        for owner in ('FC', 'BC', 'C'):
            self.write(f'agents/{owner}/outbox/{owner}-1.md', '# 简要进度\n' + '长报告正文\n' * 100)
        rows = self.feed.compact('overview')
        self.assertLessEqual(len(rows), 18)
        self.assertNotIn('长报告正文', '\n'.join(line for line, _ in rows))
        self.assertIn('backend', [action for _, action in rows])

    def test_module_card_opens_detail_and_detail_opens_original(self):
        self.write('agents/H/outbox/H-1.md', '# Harness 进度\n测试证据')
        self.assertIn('module H', [action for _, action in self.feed.compact('backend')])
        detail = self.feed.module_detail('H')
        self.assertIn('测试证据', '\n'.join(line for line, _ in detail))
        self.assertIn('open agents/H/outbox/H-1.md', [action for _, action in detail])


if __name__ == '__main__':
    unittest.main()
