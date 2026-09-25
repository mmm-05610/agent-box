"""Project state from work-status JSON blocks embedded in ordinary messages.

No natural-language closure guesses. A registered owner controls each work item;
I may supply revision zero with explicit evidence to bootstrap legacy records.
"""
import json
import re

STATES = {'working': '推进中', 'diagnosing': '定位中', 'fixing': '修复中',
          'waiting': '等待交接', 'retest': '待复验', 'verified': '本项已验证',
          'blocked': '受阻', 'not_started': '未开始', 'review': '待审阅'}
FIELDS = ('work_id', 'owner', 'state', 'done', 'problem', 'action', 'waiting_for',
          'next', 'acceptance', 'evidence')


def collect(feed):
    feed.scan()
    path = feed.mission / 'WORK-ITEMS.json'
    if not path.exists():
        return [], []
    try:
        catalog = json.loads(path.read_text())
        if not isinstance(catalog, list):
            raise ValueError('工作项目录必须为数组')
        ids = [c['id'] for c in catalog]
        if len(ids) != len(set(ids)):
            raise ValueError('工作ID重复')
        for c in catalog:
            for key in ('id', 'owner', 'module', 'title', 'scope'):
                if not isinstance(c[key], str) or not c[key]:
                    raise ValueError('无效目录字段 ' + key)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return [], ['工作项目录无效：' + str(exc)]
    registered = {c['id']: c for c in catalog}
    updates, errors = {}, []
    for item in feed.items:
        for block in re.findall(r'```work-status\s*\n(.*?)\n```', item['body'], re.S):
            try:
                data = json.loads(block)
                if not isinstance(data, dict):
                    raise ValueError('状态必须为 object')
                for key in FIELDS:
                    if not isinstance(data.get(key), str) or not data[key].strip():
                        raise ValueError('缺少字段 ' + key)
                rev = data.get('revision')
                if type(rev) is not int or rev < 0:
                    raise ValueError('revision必须为非负整数')
                rule = registered[data['work_id']]
                if data['owner'] != rule['owner']:
                    raise ValueError('owner与工作项目录不符')
                if item['owner'] != rule['owner'] and not (item['owner'] == 'I' and rev == 0):
                    raise ValueError('不是该项状态写入者')
                if data['state'] not in STATES:
                    raise ValueError('未知state')
                updates.setdefault(data['work_id'], []).append((data, item))
            except (ValueError, KeyError, TypeError) as exc:
                errors.append(item['key'] + ': ' + str(exc))
    result = []
    for rule in catalog:
        candidates = updates.get(rule['id'], [])
        card = dict(rule, update=None, source=None, conflict=False, newer=False)
        if candidates:
            revision = max(d['revision'] for d, _ in candidates)
            tops = [(d, i) for d, i in candidates if d['revision'] == revision]
            card['conflict'] = len({json.dumps(d, sort_keys=True) for d, _ in tops}) > 1
            data, source = tops[0]
            card.update(update=data, source=source)
            card['newer'] = any(i['owner'] == rule['owner'] and i['stamp'] > source['stamp']
                                and i['key'] != source['key'] for i in feed.items)
            card['history'] = sorted(candidates, key=lambda t: t[0]['revision'], reverse=True)
        result.append(card)
    return result, errors


def rows(feed, page, selected=None):
    cards, errors = collect(feed)
    if not cards and not errors:
        return None
    output = []
    if selected:
        cards = [c for c in cards if c['id'] == selected]
    else:
        cards = [c for c in cards if (page == 'overview' and c.get('overview', False))
                 or c['module'] == page or (page == 'issues' and c['update'] and
                 c['update']['state'] in ('blocked', 'diagnosing', 'fixing', 'waiting', 'retest'))]
    for c in cards:
        d = c['update']
        action = 'work ' + c['id']
        state = '状态冲突，待负责人核对' if c['conflict'] else STATES[d['state']] if d else '尚未登记状态'
        output += [('◆ ' + c['title'] + '  · ' + state, action)]
        if c['conflict']:
            output += [('  同一修订有不同内容；不选取任何一方作为当前结论。', action)]
            for old, source in c.get('history', []):
                if old['revision'] == d['revision']:
                    output.append(('  open ' + source['key'], 'open ' + source['key']))
            output.append(('', None))
            continue
        if not d:
            output += [('  负责人：' + c['owner'] + '；普通回执尚未包含本项状态。', action), ('', None)]
            continue
        for field, label in [('done', '已到'), ('problem', '卡点'), ('action', '当前'), ('next', '下一步')]:
            output.append(('  ' + label + '：' + d[field], action))
        if d['waiting_for'] != '无':
            output.append(('  等待：' + d['waiting_for'], action))
        output += [('  负责：' + c['owner'] + ' · ' + feed.stamp(c['source']) + ' 记录', action)]
        if c['newer']:
            output += [('  ⚠ 有更新交互，本项状态尚未同步；不据此假定仍在运行。', action)]
        if selected:
            output += [('范围：' + c['scope'], None), ('完成条件：' + d['acceptance'], None),
                       ('证据：' + d['evidence'], None), ('open ' + c['source']['key'], 'open ' + c['source']['key']),
                       ('修订记录（同一ID连续推进）：', None)]
            for old, source in c.get('history', []):
                output += [(f'  r{old["revision"]} · {STATES[old["state"]]} · {old["problem"]}', 'open ' + source['key'])]
        output.append(('', None))
    if not output:
        output = [('本页暂无已登记工作项；完整交互仍在“动态”页。', None)]
    output += [('⚠ ' + e, None) for e in errors]
    return output
