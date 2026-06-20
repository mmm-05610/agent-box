# Phase 3: 交互优化

> 目标：消除闪烁 + 异步刷新 + 线程安全

---

## task-3.1-page-caching

### 目标

实现页面缓存，消除导航闪烁。

### 问题

当前 `_show_page()` 每次销毁重建所有子组件，导致页面切换闪烁。

### 方案

页面缓存 + 显示/隐藏切换。

### 实现

```python
class AgentBoxApp:
    def __init__(self, root):
        # ... 其他初始化

        # 页面缓存
        self._pages: dict = {}
        self._current_page: str = None

    def _show_page(self, key: str) -> None:
        # 隐藏当前页面
        if self._current_page and self._current_page in self._pages:
            self._pages[self._current_page].grid_forget()

        # 创建或显示目标页面
        if key not in self._pages:
            self._pages[key] = self._create_page(key)

        self._pages[key].grid(row=0, column=0, sticky="nsew")
        self._current_page = key
        self.sidebar.set_active(key)

    def _create_page(self, key: str) -> ctk.CTkFrame:
        """Create a page instance."""
        if key == "home":
            return HomePage(self.content, self._on_nav, self._profiles, fetch_sessions)
        elif key == "profiles":
            return ProfilesPage(self.content, self._profiles,
                                on_profile_action=self._on_profile_action,
                                on_new=self._on_new_profile,
                                toast=self.toast)
        elif key == "sessions":
            return SessionsPage(self.content, fetch_sessions)
        elif key == "settings":
            return SettingsPage(self.content, on_theme_change=self._apply_theme)
        elif key == "help":
            return HelpPage(self.content)
        else:
            raise ValueError(f"Unknown page: {key}")

    def _apply_theme(self) -> None:
        """Rebuild all pages so all colors pick up new theme."""
        # 清除缓存，重建所有页面
        for page in self._pages.values():
            page.destroy()
        self._pages.clear()
        self._show_page(self._current_page)
```

### 注意事项

- 主题切换时需要清除缓存（因为颜色 token 变了）
- 可以用 LRU 策略限制缓存数量（最多 5 个页面）

---

## task-3.2-async-refresh

### 目标

实现异步刷新，避免阻塞 UI。

### 问题

当前 `refresh()` 同步调用 `fetch_profiles()`，阻塞 UI。

### 方案

异步刷新 + 加载状态。

### 实现

```python
class AgentBoxApp:
    def refresh(self) -> None:
        """Refresh profiles asynchronously."""
        self._show_loading(True)
        threading.Thread(target=self._fetch_profiles_async, daemon=True).start()

    def _fetch_profiles_async(self) -> None:
        """Fetch profiles in background thread."""
        try:
            profiles = fetch_profiles()
            self.root.after(0, lambda: self._on_profiles_loaded(profiles))
        except RuntimeError as exc:
            self.root.after(0, lambda: self._on_profiles_error(exc))

    def _on_profiles_loaded(self, profiles):
        """Handle successful profile fetch."""
        self._profiles = profiles
        self._show_loading(False)
        self.status_bar.configure(text=f"Loaded {len(profiles)} profile(s).")
        self.sidebar.update_status()

        # 刷新当前页面（如果依赖 profile 数据）
        if self._current_page in ("home", "profiles"):
            self._refresh_current_page()

    def _on_profiles_error(self, exc):
        """Handle profile fetch error."""
        self._profiles = []
        self._show_loading(False)
        self.status_bar.configure(text=f"Error: {exc}")
        self.sidebar.update_status()

    def _show_loading(self, loading: bool):
        """Show/hide loading indicator."""
        if loading:
            self.status_bar.configure(text="Refreshing…")
        # 可以添加 spinner 动画

    def _refresh_current_page(self):
        """Refresh current page with new data."""
        if self._current_page in self._pages:
            self._pages[self._current_page].destroy()
            del self._pages[self._current_page]
        self._show_page(self._current_page)
```

---

## task-3.3-sqlite-thread-safety

### 目标

修复 SQLite 线程安全问题。

### 问题

当前每次操作创建新连接，后台线程写、主线程读。

### 方案

单例连接 + 锁。

### 实现

在 `gui/state.py` 中使用 `SessionDB` 单例：

```python
class SessionDB:
    """Thread-safe SQLite session database."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._conn = sqlite3.connect(
                    str(DB_PATH), check_same_thread=False
                )
                cls._instance._conn.row_factory = sqlite3.Row
                cls._instance._conn.execute("PRAGMA journal_mode=WAL")
                cls._instance._init_tables()
            return cls._instance

    def execute(self, sql: str, params: tuple = ()):
        with self._lock:
            return self._conn.execute(sql, params)

    def fetchall(self, sql: str, params: tuple = ()) -> List[Dict]:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]

    def commit(self):
        with self._lock:
            self._conn.commit()
```

---

## task-3.4-incremental-list-update

### 目标

实现 Profile 列表增量更新，避免 tab 切换时销毁重建。

### 问题

当前 `_rebuild_list()` 每次 tab 切换销毁重建所有 ProfileRow。

### 方案

增量更新 + 虚拟化。

### 实现

```python
class ProfilesPage(ctk.CTkFrame):
    def __init__(self, master, profiles, on_profile_action, on_new, toast):
        super().__init__(master, fg_color=C("bg"), corner_radius=0)
        # ... 其他初始化

        # Profile 行缓存
        self._rows: dict = {}
        self._active_tab = "all"

    def _rebuild_list(self) -> None:
        """Incrementally update profile list."""
        visible = self._get_visible_profiles()
        visible_names = {p["name"] for p in visible}

        # 隐藏不可见的行
        for name, row in self._rows.items():
            if name not in visible_names:
                row.grid_forget()

        # 显示/创建可见的行
        for i, p in enumerate(visible):
            name = p["name"]
            if name not in self._rows:
                self._rows[name] = ProfileRow(
                    self.list_holder, p,
                    active=(name in self._active_profiles),
                    on_action=self._on_profile_action,
                    toast=self._toast,
                    last_cwd=self._last_cwd_by_profile.get(name, ""),
                )
            self._rows[name].grid(row=i, column=0, sticky="ew", pady=(0, 8))

    def _get_visible_profiles(self):
        """Get profiles for current tab."""
        if self._active_tab == "all":
            return self._profiles
        return [p for p in self._profiles if p.get("agent_type") == self._active_tab]
```
