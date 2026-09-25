"""Read-only projection of ordinary coordination files; never a scheduler.

File timestamps mean receipt, not verification. Prose matches are navigation
hints, never authority to close an issue or promote a product checkpoint.
"""
from datetime import datetime
from pathlib import Path
import re
import time

MODULES = {
    'frontend': [('FC', '前端装配与联调'), ('F0', '工作台与布局'),
                 ('F1', '连接器与连接'), ('F2', '项目与会话'), ('F3', '对话与交互')],
    'backend': [('BC', '后端装配与联调'), ('S', '服务与会话入口'),
                ('H', 'Harness / ACP 接入'), ('E', '执行组合')],
    'extensions': [('PROFILE', 'Profile 独立插件'), ('PROVIDER', 'Provider / Model 研究')],
    'integration': [('C', '中央集成与阶段验收'), ('FC', '前端联调'), ('BC', '后端联调')],
}
SIGNALS = re.compile(r'阻塞|卡点|待裁|待批|无法|失败|BLOCKED|UNKNOWN|blocked:|pending:', re.I)


class ProjectFeed:
    def __init__(self, mission):
        self.mission = Path(mission)
        self.cache = {}
        self.items = []
        self.errors = []
        self.scanned = -float('inf')

    def scan(self, force=False):
        if not force and time.monotonic() - self.scanned < 2:
            return self.items
        items, errors, present = [], [], set()
        agents = self.mission / 'agents'
        paths = list(agents.glob('*/status.md')) + list(agents.glob('*/outbox/*.md'))
        for path in paths:
            try:
                if path.is_symlink() or agents.resolve() not in path.resolve().parents:
                    raise ValueError('忽略越界/符号链接来源')
                stat = path.stat()
                if stat.st_size > 1024 * 1024:
                    raise ValueError('记录超过1MiB；请直接检查源文件')
                key = str(path.relative_to(self.mission))
                present.add(key)
                signature = (stat.st_mtime_ns, stat.st_size, stat.st_ino)
                old = self.cache.get(key)
                if old and old[0] == signature:
                    item = old[1]
                else:
                    body = path.read_text(encoding='utf-8')
                    title = next((s.lstrip('# ').strip() for s in body.splitlines() if s.strip()), path.stem)
                    item = dict(key=key, owner=path.relative_to(agents).parts[0],
                                id=path.stem, status=path.name == 'status.md',
                                title=title, body=body, stamp=stat.st_mtime)
                    self.cache[key] = (signature, item)
                items.append(item)
            except (OSError, UnicodeError, ValueError) as exc:
                errors.append(f'{path.name}: {exc}')
        self.cache = {k: v for k, v in self.cache.items() if k in present}
        self.items = sorted(items, key=lambda x: (x['stamp'], x['key']), reverse=True)
        self.errors, self.scanned = errors, time.monotonic()
        return self.items

    def stamp(self, item):
        return datetime.fromtimestamp(item['stamp']).astimezone().strftime('%m-%d %H:%M:%S')

    def excerpt(self, item, limit=8):
        # Keep original wording; no paraphrased claim of completion.
        metadata = re.compile(r'^\s*-?\s*(from|to|cc|type|reply_to|id|owner_generation|baseline|contract):', re.I)
        lines = [s for s in item['body'].splitlines() if s.strip() and not metadata.match(s)]
        clipped = [s[:300] + ('…' if len(s) > 300 else '') for s in lines[:limit]]
        return clipped + ([f'… 完整正文：open {item["key"]}'] if len(lines) > limit or any(len(s) > 300 for s in lines[:limit]) else [])

    def decision_lines(self, records):
        lines = ['━━ 决策执行链 · 引用不等于执行或验收 ━━']
        for record in records:
            rid = record['id']
            matches = [i for i in self.items if not i['status'] and i['owner'] != 'I'
                       and re.search(r'(?<![\w-])' + re.escape(rid) + r'(?![\w-])', i['body'])]
            state = '待用户回答' if not record['answers'] else '已回答；尚无明确执行核验'
            lines += ['', f'◆ {rid} · {record["title"]}', state]
            if record['answers']:
                lines += ['用户最新意见：' + record['answers'][-1]['text']]
            lines += [f'关联回执 {len(matches)} 件（包含历史引用，不能自动认作 ACK）：']
            lines += [f'  {self.stamp(i)} {i["title"]} | open {i["key"]}' for i in matches[:4]]
            lines += ['核验：收到/实施/验收需看回执原文；本工具不从关键词自动放行。']
        return lines

    def lines(self, page, records=()):
        self.scan()
        lines = ['━━ 自动交互投影 · status / outbox 原件 ━━',
                 '2秒内重新扫描；时间是文件更新时间，不是测试核实时间或进程心跳。',
                 '新消息不覆盖旧结论；冲突需负责人更正。open 路径查看完整正文。', '']
        if page == 'decisions':
            return lines + self.decision_lines(records)
        if page == 'issues':
            lines += ['━━ 问题线索 · 未自动判定开/闭，含历史反例与已修复项 ━━',
                      '这是全文检索入口，不冒充完整的活动问题账。看最新回执核对影响、根因、下一步。']
            for owner, _ in sum((MODULES[k] for k in ('frontend', 'backend', 'extensions')), []):
                recent = [i for i in self.items if i['owner'] == owner][:6]
                findings = [(i, [s for s in i['body'].splitlines() if SIGNALS.search(s)]) for i in recent]
                findings = [(i, s) for i, s in findings if s]
                if findings:
                    lines += ['', f'◆ {owner} · 最近6份记录中的问题线索']
                    for i, signals in findings[:3]:
                        lines += [f'{self.stamp(i)} {i["title"]}', *[s[:300] + ('…' if len(s) > 300 else '') for s in signals[:3]], '来源：open ' + i['key']]
        elif page == 'activity':
            lines += ['━━ 最近交互时间线 · 文件事实，不代表执行进程仍在运行 ━━']
            for i in [x for x in self.items if not x['status']][:40]:
                lines += ['', f'◆ {self.stamp(i)} [{i["owner"]}] {i["title"]}',
                          *self.excerpt(i, 10), '来源：open ' + i['key']]
        else:
            groups = list(MODULES) if page == 'overview' else [page]
            for group in groups:
                if group not in MODULES:
                    continue
                lines += ['', '━━ ' + {'frontend': '前端', 'backend': '后端', 'integration': '集成验收', 'extensions': '拓展（不计入主线）'}[group] + ' ━━']
                for owner, name in MODULES[group]:
                    owned = [i for i in self.items if i['owner'] == owner]
                    status = next((i for i in owned if i['status']), None)
                    messages = [i for i in owned if not i['status']]
                    lines += ['', f'┌ {name} · {owner}']
                    if not owned:
                        lines += ['尚无状态/消息，不能认定正在执行。']
                        continue
                    age = max(0, int((time.time() - owned[0]['stamp']) / 60))
                    lines += [f'最近交互距今 {age} 分钟；' + ('⚠ 无新消息，运行/阻塞情况待核实' if age >= 15 else '只表示有文件更新，不证明进程存活')]
                    if status:
                        lines += [f'状态原件 {self.stamp(status)} | open {status["key"]}']
                    if messages and (not status or messages[0]['stamp'] > status['stamp']):
                        lines += ['⚠ 有比 status 更新的回执；旧状态可能滞后，不能直接当现状。']
                    shown = messages[:1 if page == 'overview' else 3] or ([status] if status else [])
                    for i in shown:
                        lines += [f'最近交互 {self.stamp(i)}', *self.excerpt(i, 3 if page == 'overview' else 18),
                                  '└ 来源：open ' + i['key']]
                    if page != 'overview' and status:
                        lines += ['状态正文节选：', *self.excerpt(status, 18)]
        return lines + ['⚠ 来源读取异常：' + e for e in self.errors]

    def search(self, text):
        self.scan()
        matches = [i for i in self.items if text.casefold() in i['body'].casefold()]
        lines = [f'━━ 全部普通记录搜索：{text} · {len(matches)} 件 ━━', '结果含历史，不自动认定为活动问题。']
        for i in matches:
            lines += ['', f'{self.stamp(i)} {i["title"]}', 'open ' + i['key']]
        return lines

    def compact(self, page, records=()):
        """Short, clickable cards. Full original evidence is one action away."""
        self.scan()
        if page not in ('activity', 'decisions'):
            from work_status import rows
            projected = rows(self, page)
            if projected is not None:
                return projected
        rows = []

        def card(title, item, action=None):
            rows.append(('◆ ' + title, action or ('open ' + item['key'] if item else None)))
            if item:
                title_text = re.sub(r'^\S+\s+[—–-]\s*', '', item['title'])
                rows.append(('  ' + title_text, action or 'open ' + item['key']))
                rows.append(('  ' + self.stamp(item) + ' 更新 · 点击查看', action or 'open ' + item['key']))
            else:
                rows.append(('  尚无记录', None))
            rows.append(('', None))

        if page == 'overview':
            rows += [('主线概览', None), ('只展示最近回执标题；详情中保留原始证据。', None), ('', None)]
            for group, owner, label in [('frontend', 'FC', '前端'), ('backend', 'BC', '后端'),
                                        ('integration', 'C', '集成与验收')]:
                item = next((i for i in self.items if i['owner'] == owner and not i['status']), None)
                card(label, item, group)
            rows += [('拓展 · Profile / Provider 独立推进，不计入本阶段', 'extensions')]
        elif page in MODULES:
            for owner, label in MODULES[page]:
                item = next((i for i in self.items if i['owner'] == owner and not i['status']), None)
                item = item or next((i for i in self.items if i['owner'] == owner), None)
                card(label + '  / ' + owner, item, 'module ' + owner)
        elif page == 'decisions':
            pending = [r for r in records if not r['answers']]
            rows += [(f'需要你回答：{len(pending)} 项', None), ('已答不等于已执行；点开查看答复与关联回执。', None), ('', None)]
            for r in pending + [r for r in records if r['answers']]:
                rows += [(('◆ 待答  ' if not r['answers'] else '· 已答  ') + r['title'], 'show ' + r['id']),
                         ('  ' + r['id'] + ' · 点击查看', 'show ' + r['id']), ('', None)]
        elif page == 'issues':
            rows += [('近期问题线索（含已修复/历史项，非活动阻塞判定）', None), ('', None)]
            for owner, label in [('C', '集成')] + sum((MODULES[k] for k in ('frontend', 'backend', 'extensions')), []):
                recent = [i for i in self.items if i['owner'] == owner][:6]
                matches = [i for i in recent if SIGNALS.search(i['body'])]
                if matches:
                    card(label + ' / ' + owner, matches[0])
        elif page == 'activity':
            rows += [('最近交互 · 点击标题看全文', None), ('', None)]
            for i in [i for i in self.items if not i['status']][:40]:
                rows += [(self.stamp(i) + '  ' + i['owner'], 'open ' + i['key']),
                         ('  ' + i['title'], 'open ' + i['key']), ('', None)]
        rows += [('⚠ ' + e, None) for e in self.errors]
        return rows

    def module_detail(self, owner):
        self.scan()
        owned = [i for i in self.items if i['owner'] == owner]
        rows = [('模块 ' + owner + ' · 回执与状态分别呈现，不自动解决冲突', None), ('', None)]
        status = next((i for i in owned if i['status']), None)
        messages = [i for i in owned if not i['status']][:3]
        if messages and status and messages[0]['stamp'] > status['stamp']:
            rows += [('⚠ 回执比 status 更新；旧状态可能滞后。', None), ('', None)]
        for i in messages + ([status] if status else []):
            rows += [('◆ ' + self.stamp(i) + ' ' + i['title'], 'open ' + i['key'])]
            rows += [(line, 'open ' + i['key']) for line in self.excerpt(i, 7)]
            rows += [('  点击查看完整原文', 'open ' + i['key']), ('', None)]
        return rows or [('尚无记录', None)]

    def detail(self, key):
        self.scan()
        item = next((i for i in self.items if i['key'] == key), None)
        if not item:
            return ['未找到已收录记录；只能打开 agents/*/status.md 或 outbox/*.md。']
        return [item['key'], '更新时间：' + self.stamp(item), '原件全文（自报，不自动认定已核验）', '', *item['body'].splitlines()]
