import json
import tempfile
import unittest
from pathlib import Path
from project_feed import ProjectFeed
from work_status import collect, rows


class WorkStatusTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.feed = ProjectFeed(self.root)
        (self.root / 'WORK-ITEMS.json').write_text(json.dumps([
            dict(id='W-1', owner='FC', module='frontend', title='桌面两轮', scope='仅两轮', overview=True)]))
        self.data = dict(work_id='W-1', owner='FC', revision=1, state='retest', done='最小修已提交',
                         problem='尚未复验', action='准备复验', waiting_for='BC', next='真实两轮',
                         acceptance='显示两次回复', evidence='report.md')

    def post(self, owner='FC', name='m', **changes):
        data = dict(self.data, **changes)
        path = self.root / f'agents/{owner}/outbox/{name}.md'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('# 正常交接\n```work-status\n' + json.dumps(data) + '\n```\n')
        self.feed.scan(force=True)

    def test_regular_message_updates_card_without_publish(self):
        self.post()
        text = '\n'.join(l for l, _ in self.feed.compact('overview'))
        self.assertIn('最小修已提交', text)
        self.assertIn('等待：BC', text)
        self.assertNotIn('report.md', text)
        self.assertIn('report.md', '\n'.join(l for l, _ in rows(self.feed, 'overview', 'W-1')))

    def test_revision_not_file_timestamp_wins(self):
        self.post(name='a', revision=2, state='verified', problem='无')
        self.post(name='b', revision=1)
        self.assertEqual(collect(self.feed)[0][0]['update']['state'], 'verified')

    def test_conflicting_revision_never_claims_current_result(self):
        self.post(name='a')
        self.post(name='b', state='verified')
        text = '\n'.join(l for l, _ in rows(self.feed, 'overview'))
        self.assertIn('状态冲突', text)
        self.assertNotIn('本项已验证', text)

    def test_non_owner_cannot_overwrite(self):
        self.post()
        self.post(owner='BC', revision=9, state='verified')
        cards, errors = collect(self.feed)
        self.assertEqual(cards[0]['update']['state'], 'retest')
        self.assertTrue(errors)

    def test_bootstrap_then_owner(self):
        self.post(owner='I', revision=0)
        self.post(revision=1, state='fixing')
        cards, errors = collect(self.feed)
        self.assertFalse(errors)
        self.assertEqual(cards[0]['update']['state'], 'fixing')
        self.assertEqual(len(cards[0]['history']), 2)

    def test_missing_field_not_accepted(self):
        self.post(action='')
        cards, errors = collect(self.feed)
        self.assertTrue(errors)
        self.assertIsNone(cards[0]['update'])

    def test_plain_new_message_warns_not_automatic_completion(self):
        self.post()
        p = self.root / 'agents/FC/outbox/latest.md'
        p.write_text('# DONE ACK completed')
        self.feed.scan(force=True)
        cards, _ = collect(self.feed)
        self.assertTrue(cards[0]['newer'])
        self.assertEqual(cards[0]['update']['state'], 'retest')

    def test_identical_copy_is_not_conflict(self):
        self.post(name='a')
        self.post(name='b')
        self.assertFalse(collect(self.feed)[0][0]['conflict'])

    def test_unknown_work_and_bad_json_are_visible(self):
        self.post(work_id='missing')
        self.assertTrue(collect(self.feed)[1])


if __name__ == '__main__':
    unittest.main()
