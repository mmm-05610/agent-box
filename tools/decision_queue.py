#!/usr/bin/env python3
"""Local human decision inbox. Standard library only; no agent/model execution."""
import argparse
from contextlib import contextmanager
import curses
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata
import uuid
from project_feed import ProjectFeed

DEFAULT = Path(__file__).resolve().parents[1] / 'missions/HD-002'
LABELS = {'IN_PROGRESS': '进行中', 'BLOCKED': '受阻', 'READY_FOR_USER_REVIEW': '可验收',
          'DONE': '已完成', 'NOT_STARTED': '未开始'}


def freshness(stamp):
    try:
        date = datetime.fromisoformat(stamp)
        minutes = max(0, int((datetime.now(timezone.utc) - date).total_seconds() / 60))
        return f'{date.astimezone():%H:%M:%S} · {minutes}分钟前核实' + (' ⚠ 超过5分钟未核实' if minutes >= 5 else '')
    except (ValueError, TypeError):
        return '尚无有效核实时间'


def now():
    return datetime.now(timezone.utc).isoformat()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def clean(value):
    return ''.join(c if c == '\n' or not unicodedata.category(c).startswith('C') else ' ' for c in str(value))


class Queue:
    def __init__(self, mission):
        self.mission = Path(mission)
        self.feed = ProjectFeed(self.mission)
        self.root = self.mission / 'decision-queue'
        for name in ('requests', 'answers'):
            (self.root / name).mkdir(parents=True, exist_ok=True)

    @contextmanager
    def locked(self):
        with (self.root / '.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield

    def write(self, path, value):
        data = value if isinstance(value, bytes) else encoded(value)
        fd, tmp = tempfile.mkstemp(prefix='.pending-', dir=path.parent)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    def submit(self, source):
        if not isinstance(source, dict):
            raise ValueError('请求必须是 JSON object')
        fields = ('id', 'title', 'question', 'recommendation', 'alternatives', 'impact', 'evidence')
        for key in fields:
            if not isinstance(source.get(key), str) or not source[key].strip():
                raise ValueError(f'缺少非空字符串字段: {key}')
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', source['id']):
            raise ValueError('ID只能包含字母、数字、下划线和连字符，最长80字符')
        record = {key: source[key].strip() for key in fields}
        with self.locked():
            path = self.root / 'requests' / (record['id'] + '.json')
            if path.exists():
                old = json.loads(path.read_text())
                if any(old.get(k) != record[k] for k in fields):
                    raise ValueError('同ID内容不同，拒绝覆盖；修改提案请使用新ID并引用旧项')
            else:
                record['created_at'] = now()
                self.write(path, record)
            self.render()

    def snapshot(self):
        records, errors = [], []
        for path in sorted((self.root / 'requests').glob('*.json')):
            try:
                r = json.loads(path.read_text())
                if r['id'] != path.stem:
                    raise ValueError('ID与文件名不符')
                for key in ('title', 'question', 'recommendation', 'alternatives', 'impact', 'evidence', 'created_at'):
                    if not isinstance(r[key], str):
                        raise ValueError('无效字段: ' + key)
                r_hash = digest(r)
                answers = []
                for ap in sorted((self.root / 'answers').glob(path.stem + '--*.json')):
                    a = json.loads(ap.read_text())
                    if a['request_hash'] != r_hash or a['id'] != r['id']:
                        errors.append(f'{ap.name}: 请求摘要不匹配，答复不生效')
                        continue
                    if not isinstance(a['text'], str) or not isinstance(a['created_at'], str):
                        raise ValueError('无效答复')
                    answers.append(a)
                r['answers'] = sorted(answers, key=lambda a: a['created_at'])
                records.append(r)
            except (ValueError, KeyError, TypeError, OSError) as exc:
                errors.append(f'{path.name}: {exc}')
        return sorted(records, key=lambda r: (r['created_at'], r['id'])), errors

    def answer(self, rid, text):
        if not text.strip():
            raise ValueError('答复不能为空')
        with self.locked():
            records, errors = self.snapshot()
            record = next((r for r in records if r['id'] == rid), None)
            if record is None:
                raise ValueError('找不到有效请求: ' + rid)
            record = dict(record)
            record.pop('answers')
            answer = dict(id=rid, text=text.strip(), created_at=now(), request_hash=digest(record))
            self.write(self.root / 'answers' / (rid + '--' + uuid.uuid4().hex + '.json'), answer)
            self.render()

    def checkpoint(self):
        path = self.root / 'checkpoint-latest.json'
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        self.validate_checkpoint(data)
        return data

    def publish_extension(self, source):
        self.validate_checkpoint(source)
        if source['id'] not in ('profile', 'provider') or 'sections' in source:
            raise ValueError('拓展仅接受profile/provider独立模块快照')
        for module in source['modules']:
            for key in ('owner', 'done', 'doing', 'next', 'blockers', 'evidence', 'observed_at'):
                if not isinstance(module.get(key), str) or not module[key].strip():
                    raise ValueError('拓展模块缺少字段: ' + key)
            if datetime.fromisoformat(module['observed_at']).tzinfo is None:
                raise ValueError('核实时间必须带时区')
        data = {key: source[key] for key in ('id', 'revision', 'status', 'summary', 'next', 'evidence', 'modules')}
        data['try_it'] = source.get('try_it', '')
        with self.locked():
            path = self.root / ('extension-' + source['id'] + '.json')
            if path.exists():
                old = json.loads(path.read_text())
                if {k: v for k, v in old.items() if k != 'updated_at'} == data:
                    self.render()
                    return
                if data['revision'] <= old['revision']:
                    raise ValueError('过期拓展更新：revision必须递增')
            data['updated_at'] = now()
            self.write(path, data)
            self.render()

    def extension_lines(self, live=False):
        lines = ['━━ 拓展 · 独立研究/施工，不计入会话基线验收 ━━']
        for name in ('profile', 'provider'):
            path = self.root / ('extension-' + name + '.json')
            if not path.exists():
                lines += ['', name + '：尚未收到进度，不能视作完成。']
                continue
            try:
                data = json.loads(path.read_text())
                self.validate_checkpoint(data)
                if data['id'] != name:
                    raise ValueError('拓展ID与文件不符')
                lines += ['', f"◆ {name} · {LABELS[data['status']]} · 更新 #{data['revision']}", data['summary']]
                for module in data['modules']:
                    lines += ['', f"┌ {module['name']} [{LABELS[module['status']]}] 负责：{module['owner']}",
                              '│ 结论：' + module['summary'], '│ 已完成：' + module['done'],
                              '│ 正在做：' + module['doing'], '│ 下一步：' + module['next'],
                              '│ 阻塞：' + module['blockers'],
                              '│ 核实：' + (freshness(module['observed_at']) if live else module['observed_at']),
                              '└ 证据：' + module['evidence']]
                lines += ['下一步：' + data['next']]
            except (ValueError, KeyError, TypeError, OSError) as exc:
                lines += [name + ' 数据异常（不可视作完成）：' + str(exc)]
        return lines

    @staticmethod
    def validate_checkpoint(data):
        if not isinstance(data, dict):
            raise ValueError('checkpoint必须是object')
        for key in ('id', 'summary', 'next', 'evidence'):
            if not isinstance(data.get(key), str) or not data[key].strip():
                raise ValueError('checkpoint缺少文字字段: ' + key)
        if data.get('status') not in ('IN_PROGRESS', 'BLOCKED', 'READY_FOR_USER_REVIEW'):
            raise ValueError('checkpoint状态必须是IN_PROGRESS/BLOCKED/READY_FOR_USER_REVIEW')
        if not isinstance(data.get('revision'), int) or isinstance(data['revision'], bool) or data['revision'] < 1:
            raise ValueError('revision必须为正整数')
        sections = data.get('sections')
        modules = data.get('modules')
        if sections is not None:
            if not isinstance(sections, list) or {s.get('id') for s in sections if isinstance(s, dict)} != {'frontend', 'backend', 'integration'} or len(sections) != 3:
                raise ValueError('sections必须恰含frontend/backend/integration三部分')
            modules = []
            for section in sections:
                for key in ('name', 'summary', 'next', 'blockers', 'evidence', 'observed_at'):
                    if not isinstance(section.get(key), str) or not section[key].strip():
                        raise ValueError('阶段缺少字段: ' + key)
                if section.get('status') not in LABELS:
                    raise ValueError('阶段状态非法')
                if not isinstance(section.get('modules'), list) or not section['modules']:
                    raise ValueError('每个阶段须有模块')
                for module in section['modules']:
                    if not isinstance(module, dict):
                        raise ValueError('模块必须是object')
                    for key in ('owner', 'done', 'doing', 'next', 'blockers', 'evidence', 'observed_at'):
                        if not isinstance(module.get(key), str) or not module[key].strip():
                            raise ValueError('模块缺少详细字段: ' + key)
                    stamp = datetime.fromisoformat(module['observed_at'])
                    if stamp.tzinfo is None:
                        raise ValueError('核实时间必须带时区')
                if datetime.fromisoformat(section['observed_at']).tzinfo is None:
                    raise ValueError('阶段核实时间必须带时区')
                if section['status'] in ('DONE', 'READY_FOR_USER_REVIEW') and any(m.get('status') != 'DONE' for m in section['modules']):
                    raise ValueError('阶段仍有未完成模块，不能宣称完成')
                modules.extend(section['modules'])
        if not isinstance(modules, list) or not modules:
            raise ValueError('必须按模块报告进展')
        names = set()
        for module in modules:
            if not isinstance(module, dict):
                raise ValueError('module必须是object')
            for key in ('name', 'summary'):
                if not isinstance(module.get(key), str) or not module[key].strip():
                    raise ValueError('模块必须有名称和一句话进展')
            if module['name'] in names:
                raise ValueError('模块名称重复')
            names.add(module['name'])
            if module.get('status') not in ('DONE', 'IN_PROGRESS', 'BLOCKED', 'NOT_STARTED'):
                raise ValueError('模块状态非法')
            if re.fullmatch(r'[0-9a-fA-F]{7,64}', module['summary'].strip()):
                raise ValueError('模块进展不能只填commit摘要')
        if data['status'] == 'READY_FOR_USER_REVIEW':
            if sections and any(s['status'] not in ('DONE', 'READY_FOR_USER_REVIEW') for s in sections):
                raise ValueError('阶段未就绪，不能提交整体验收')
            if not isinstance(data.get('try_it'), str) or not data['try_it'].strip():
                raise ValueError('提交用户验收必须给启动/验收入口try_it')
            if any(m['status'] != 'DONE' for m in modules):
                raise ValueError('仍有未完成模块，不能提交阶段验收')

    def publish_checkpoint(self, source):
        self.validate_checkpoint(source)
        data = {key: source[key] for key in ('id', 'revision', 'status', 'summary', 'next', 'evidence')}
        if 'sections' in source:
            data['sections'] = source['sections']
            data['modules'] = [m for s in source['sections'] for m in s['modules']]
        else:
            data['modules'] = source['modules']
        data['try_it'] = source.get('try_it', '')
        if not isinstance(data['try_it'], str):
            raise ValueError('try_it必须是文字')
        with self.locked():
            old = self.checkpoint()
            if old:
                previous = {k: v for k, v in old.items() if k != 'updated_at'}
                if previous == data:
                    self.render()
                    return
                if data['revision'] <= old['revision']:
                    raise ValueError('过期checkpoint更新：revision必须大于当前值')
            data['updated_at'] = now()
            self.write(self.root / 'checkpoint-latest.json', data)
            self.render()

    def checkpoint_lines(self, page='overview', live=False):
        if page == 'extensions':
            return self.extension_lines(live)
        try:
            cp = self.checkpoint()
        except (ValueError, OSError, KeyError, TypeError) as exc:
            return ['检查点数据异常（不可视作已就绪）: ' + str(exc)]
        if cp is None:
            return ['尚未收到阶段进展报告；无报告不等于完成。']
        if cp.get('sections'):
            lines = [f"◆ {cp['id']}  │  {LABELS[cp['status']]}  │  更新 #{cp['revision']}", cp['summary'], '']
            sections = cp['sections'] if page in ('overview', 'full') else [s for s in cp['sections'] if s['id'] == page]
            for section in sections:
                lines += [f"━━ {section['name']}  ·  {LABELS[section['status']]} ━━", section['summary']]
                stamp = freshness(section['observed_at']) if live else section['observed_at']
                lines += ['最近核实：' + stamp]
                if page == 'overview':
                    counts = {key: sum(m['status'] == key for m in section['modules']) for key in ('DONE', 'IN_PROGRESS', 'BLOCKED', 'NOT_STARTED')}
                    lines += ['模块概况：' + ' / '.join(f'{LABELS[key]} {count}' for key, count in counts.items() if count)]
                    lines += ['卡点：' + section['blockers'], '下一步：' + section['next'], '']
                else:
                    for index, module in enumerate(section['modules'], 1):
                        lines += ['', f"┌ {index}. {module['name']}  [{LABELS[module['status']]}]  负责：{module['owner']}",
                                  '│ 结论：' + module['summary'], '│ 已完成：' + module['done'],
                                  '│ 正在做：' + module['doing'], '│ 下一步：' + module['next'],
                                  '│ 阻塞：' + module['blockers'],
                                  '│ 核实：' + (freshness(module['observed_at']) if live else module['observed_at']),
                                  '└ 证据：' + module['evidence']]
                    lines += ['', '阶段卡点：' + section['blockers'], '阶段下一步：' + section['next'], '']
            lines += ['整体下一步：' + cp['next']]
            if cp.get('try_it'):
                lines += ['验收入口：' + cp['try_it']]
            return lines
        state = {'IN_PROGRESS': '施工中', 'BLOCKED': '受阻', 'READY_FOR_USER_REVIEW': '可开始验收'}
        module_state = {'DONE': '完成', 'IN_PROGRESS': '进行中', 'BLOCKED': '受阻', 'NOT_STARTED': '未开始'}
        lines = [f"{cp['id']} · {state[cp['status']]} · 第{cp['revision']}次更新",
                 f"更新时间：{cp.get('updated_at', '未记录')}", cp['summary']]
        lines += [f"[{module_state[m['status']]}] {m['name']}：{m['summary']}" for m in cp['modules']]
        lines += ['下一步：' + cp['next']]
        if cp.get('try_it'):
            lines += ['验收入口：' + cp['try_it']]
        lines += ['证据：' + cp['evidence']]
        return lines

    def render(self):
        records, errors = self.snapshot()
        pending = sum(not r['answers'] for r in records)
        lines = ['# 用户决策台', '', f'待回答 {pending} 项 · 已回答 {len(records)-pending} 项', '',
                 '此文件由队列工具生成，C和用户均不直接编辑。用户在终端回答，答复自动显示在各项“用户回答”处。',
                 '答复原件在 decision-queue/answers/；C读取后在自己的outbox确认收到并执行。回答不等于执行完成。', '']
        lines += ['## 最新阶段检查点（只显示最新状态，不进入审批队列）', '']
        for line in self.checkpoint_lines('full') + [''] + self.extension_lines():
            line = clean(line)
            if line.startswith('━━ '):
                lines += ['', '### ' + line.strip('━ '), '']
            elif line.startswith('┌ '):
                lines += ['', '#### ' + line[2:], '']
            elif line.startswith(('│ ', '└ ')):
                lines += ['- ' + line[2:]]
            else:
                lines += [line, '']
        lines += ['## 自动交互进展（普通消息直接可见；不替代验收结论）', '']
        lines += [clean(line) for line, _ in self.feed.compact('overview', records)]
        lines += ['', '## 决策请求', '']
        if not records:
            lines += ['目前没有决策请求。', '']
        for r in records:
            lines += [f"## {r['id']} · {'已回答' if r['answers'] else '待回答'} · {clean(r['title'])}", '']
            for key, label in [('question', '问题'), ('recommendation', '推荐'), ('alternatives', '替代方案'), ('impact', '影响'), ('evidence', '证据')]:
                lines += [f'### {label}', '', clean(r[key]), '']
            lines += ['### 用户回答', '']
            if r['answers']:
                for a in r['answers']:
                    lines += [f"{a['created_at']}：", '', '> ' + clean(a['text']).replace('\n', '\n> '), '']
                lines += ['同一请求如有修订，以最后一条回答为准，历史保留。', '']
            else:
                lines += [f"尚未回答。在终端输入：answer {r['id']} 你的意见", '']
        if errors:
            lines += ['## 队列异常（不得视作批准）', ''] + [clean(e) for e in errors]
        content = ('\n'.join(lines) + '\n').encode()
        path = self.mission / 'USER-DECISIONS.md'
        if not path.exists() or path.read_bytes() != content:
            self.write(path, content)
        return records, errors


def clip(text, width):
    result, used = '', 0
    for ch in clean(text).replace('\n', ' '):
        size = 2 if unicodedata.east_asian_width(ch) in 'WF' else 1
        if used + size > width:
            break
        result += ch
        used += size
    return result


def cell_width(text):
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in text)


def mouse_intent(x, y, state, targets):
    """Decode independently of a live terminal, with wheel events first."""
    if state & getattr(curses, 'BUTTON4_PRESSED', 0):
        return 'up'
    if state & getattr(curses, 'BUTTON5_PRESSED', 0):
        return 'down'
    if state & (curses.BUTTON1_CLICKED | curses.BUTTON1_PRESSED):
        return next((action for row, start, end, action in targets
                     if row == y and start <= x < end), None)
    return None


def terminal(screen, queue):
    screen.timeout(500)
    screen.keypad(True)
    try:
        curses.mousemask(curses.ALL_MOUSE_EVENTS)
        curses.mouseinterval(0)
    except curses.error:
        pass  # Keyboard navigation remains available on terminals without mouse.
    if curses.has_colors():
        curses.start_color()
        curses.use_default_colors()
        for number, color in enumerate((curses.COLOR_CYAN, curses.COLOR_GREEN, curses.COLOR_YELLOW, curses.COLOR_RED), 1):
            curses.init_pair(number, color, -1)
    page = 'overview'
    opened = None
    search = None
    module = None
    history = []
    command, message, chosen, offset, confirmation = '', '队列自动刷新；不会调用模型。', None, 0, None
    while True:
        with queue.locked():
            records, errors = queue.render()
        lines = []
        rows = None
        compact = False
        if search:
            lines = queue.feed.search(search)
        elif opened:
            if opened.startswith('@work:'):
                from work_status import rows as work_rows
                rows = work_rows(queue.feed, page, opened[6:])
            else:
                lines = queue.checkpoint_lines('full', live=True) if opened == '@checkpoint' else queue.feed.detail(opened)
        elif module:
            rows = queue.feed.module_detail(module)
        elif chosen:
            r = next((r for r in records if r['id'] == chosen), None)
            if r:
                for k in ('id', 'title', 'question', 'recommendation', 'alternatives', 'impact', 'evidence'):
                    lines += [k + ':'] + clean(r[k]).splitlines() + ['']
                lines += ['用户回答:'] + [clean(a['text']) for a in r['answers']]
                lines += [''] + queue.feed.decision_lines([r])
        else:
            rows = queue.feed.compact(page, records)
            compact = True
            if page == 'integration':
                try:
                    cp = queue.checkpoint()
                    if cp:
                        rows = [('◆ 阶段：' + LABELS[cp['status']] + ' · 点击看验收记录', 'open @checkpoint'),
                                (cp['summary'], 'open @checkpoint'), ('', None)] + rows
                except (ValueError, KeyError, TypeError, OSError) as exc:
                    rows.insert(0, ('⚠ 检查点无效：' + str(exc), None))
        if rows is None:
            rows = [(line, 'open ' + line.strip()[5:] if line.strip().startswith('open ') else None) for line in lines]
        rows += [('异常: ' + e, None) for e in errors]
        height, width = screen.getmaxyx()
        body_top, body_height = 4, max(1, height - 8)
        # Wrap long lines for readable details, including Chinese terminal widths.
        wrapped = []
        for line, action in rows:
            line = clean(line).replace('\n', ' ')
            if compact:
                short = clip(line, max(1, width - 3))
                wrapped.append((short + ('…' if short != line else ''), action))
                continue
            if not line:
                wrapped.append(('', action))
            while line:
                part = clip(line, max(1, width - 2))
                if not part:
                    break
                wrapped.append((part, action))
                line = line[len(part):]
        offset = max(0, min(offset, max(0, len(wrapped)-body_height)))
        screen.erase()
        def put(y, value, x=0):
            if 0 <= y < height:
                try:
                    style = 0
                    if value.startswith(('━━', '◆', '┌')):
                        style = curses.A_BOLD | (curses.color_pair(1) if curses.has_colors() else 0)
                    if '⚠' in value or '[受阻]' in value:
                        style = curses.color_pair(4) if curses.has_colors() else curses.A_BOLD
                    screen.addstr(y, x, clip(value, max(0, width-x-1)), style)
                except curses.error:
                    pass
        targets = []
        put(0, f'Ordessa  /  进度台     待答 {sum(not r["answers"] for r in records)}     自动刷新')
        tabs = [('1 总览', 'overview'), ('2 前端', 'frontend'), ('3 后端', 'backend'), ('4 验收', 'integration'),
                ('5 审批', 'decisions'), ('6 拓展', 'extensions'), ('7 问题', 'issues'), ('8 动态', 'activity')]
        for index, (label, dest) in enumerate(tabs):
            y, x = 1 + index // 4, (index % 4) * max(1, width // 4)
            value = ('[' + label + ']' if page == dest else ' ' + label + ' ')
            put(y, value, x)
            targets.append((y, x, min(width, x + max(1, width // 4)), dest))
        for row, (line, action) in enumerate(wrapped[offset:offset+body_height], body_top):
            put(row, line)
            if action:
                targets.append((row, 0, width, action))
        buttons = '[ 返回 ]  [ 上一页 ]  [ 下一页 ]'
        put(height-4, buttons + f'    {offset+1}–{min(offset+body_height, len(wrapped))}/{len(wrapped)}')
        for label, action in [('[ 返回 ]', 'back'), ('[ 上一页 ]', 'prev'), ('[ 下一页 ]', 'next')]:
            start = cell_width(buttons[:buttons.index(label)])
            targets.append((height-4, start, start + cell_width(label), action))
        put(height-3, message)
        put(height-2, '滚轮滚动 · 点击标题/分页 · Esc返回 · answer ID 意见 · quit退出')
        put(height-1, '> ' + command)
        screen.refresh()
        try:
            key = screen.get_wch()
        except curses.error:
            continue
        action = None
        if key == curses.KEY_MOUSE:
            try:
                _, x, y, _, state = curses.getmouse()
                action = mouse_intent(x, y, state, targets)
            except curses.error:
                pass
            if action in ('up', 'down'):
                offset = max(0, offset + (-3 if action == 'up' else 3))
                continue
            if not action:
                continue
        elif key == '\x1b':
            action = 'back'
        if action or key in ('\n', '\r', curses.KEY_ENTER):
            value = action or command.strip()
            if not action:
                command = ''
            try:
                if confirmation and action:
                    message = '答复待确认：输入 y 提交，其他文字取消。'
                    continue
                if value in ('next', 'prev'):
                    offset = max(0, offset + (body_height if value == 'next' else -body_height))
                    continue
                if value == 'back':
                    if history:
                        page, opened, search, module, chosen, offset = history.pop()
                    else:
                        opened, search, module, chosen, offset = None, None, None, None, 0
                    continue
                if value.startswith(('open ', 'work ', 'module ', 'show ', 'find ')):
                    history.append((page, opened, search, module, chosen, offset))
                if confirmation:
                    if value.lower() == 'y':
                        queue.answer(*confirmation)
                        message = '答复已保存；C可读取。'
                    else:
                        message = '已取消提交，请重新输入答复。'
                    confirmation = None
                elif value in ('quit', 'q'):
                    return
                elif value in ('list', 'checkpoint'):
                    module = None
                    search = None
                    opened = None
                    chosen, offset, page = None, 0, 'overview'
                elif value in ('1', '2', '3', '4', '5', '6', '7', '8', 'frontend', 'backend', 'integration', 'decisions', 'extensions', 'issues', 'activity'):
                    module = None
                    history = []
                    search = None
                    opened = None
                    page = {'1': 'overview', '2': 'frontend', '3': 'backend', '4': 'integration', '5': 'decisions', '6': 'extensions', '7': 'issues', '8': 'activity'}.get(value, value)
                    chosen, offset = None, 0
                elif value.startswith('open '):
                    module = None
                    search = None
                    opened, chosen, offset = value[5:].strip(), None, 0
                elif value.startswith('work '):
                    module, search, chosen, offset = None, None, None, 0
                    opened = '@work:' + value[5:].strip()
                elif value.startswith('find '):
                    module = None
                    search, opened, chosen, offset = value[5:].strip(), None, None, 0
                elif value.startswith('show '):
                    module = None
                    search = None
                    opened = None
                    chosen, offset = value[5:].strip(), 0
                    if not any(r['id'] == chosen for r in records):
                        message = '没有这个ID'
                elif value.startswith('module '):
                    module, opened, search, chosen, offset = value[7:].strip(), None, None, None, 0
                elif value.startswith('answer '):
                    _, rid, reply = value.split(maxsplit=2)
                    if not any(r['id'] == rid for r in records):
                        raise ValueError('没有这个ID')
                    confirmation = (rid, reply)
                    message = f'提交给 {rid}: {reply} —— 输入 y 确认，其他输入取消'
                elif value:
                    message = '未知命令'
            except (ValueError, OSError) as exc:
                message = str(exc)
        elif key in (curses.KEY_BACKSPACE, '\x7f', '\b'):
            command = command[:-1]
        elif key == curses.KEY_NPAGE:
            offset += body_height
        elif key == curses.KEY_PPAGE:
            offset = max(0, offset-body_height)
        elif key == curses.KEY_DOWN:
            offset += 1
        elif key == curses.KEY_UP:
            offset = max(0, offset-1)
        elif isinstance(key, str) and key.isprintable():
            command += key


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mission', type=Path, default=DEFAULT)
    sub = parser.add_subparsers(dest='action', required=True)
    submit = sub.add_parser('submit')
    submit.add_argument('file', type=Path)
    checkpoint = sub.add_parser('checkpoint', help='发布最新模块进展，不添加审批项')
    checkpoint.add_argument('file', type=Path)
    extension = sub.add_parser('extension', help='发布独立拓展进度，不影响主线检查点')
    extension.add_argument('file', type=Path)
    sub.add_parser('refresh')
    sub.add_parser('watch')
    view = sub.add_parser('view', help='只读输出自动交互面板，适合非交互终端')
    view.add_argument('page', choices=['overview', 'frontend', 'backend', 'integration', 'extensions', 'issues', 'activity', 'decisions'])
    answer = sub.add_parser('answer')
    answer.add_argument('id')
    answer.add_argument('--file', required=True, type=Path, help='用户答复文本，可多行')
    args = parser.parse_args()
    queue = Queue(args.mission)
    try:
        if args.action == 'submit':
            queue.submit(json.loads(args.file.read_text()))
            print('已入队；重复同ID同内容不会新增。')
        elif args.action == 'checkpoint':
            queue.publish_checkpoint(json.loads(args.file.read_text()))
            print('最新阶段检查点已更新；审批队列不变。')
        elif args.action == 'extension':
            queue.publish_extension(json.loads(args.file.read_text()))
            print('拓展进度已更新；主线检查点和审批队列不变。')
        elif args.action == 'answer':
            queue.answer(args.id, args.file.read_text())
            print('已保存用户答复。')
        elif args.action == 'refresh':
            with queue.locked():
                records, errors = queue.render()
            print(f'请求 {len(records)}，异常 {len(errors)}')
            return bool(errors)
        elif args.action == 'view':
            records, errors = queue.snapshot()
            print('\n'.join(clean(line) for line, _ in queue.feed.compact(args.page, records)))
            for error in errors:
                print('队列异常：' + clean(error))
        else:
            curses.wrapper(terminal, queue)
    except (ValueError, OSError, curses.error) as exc:
        print('错误:', exc)
        return 1
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
