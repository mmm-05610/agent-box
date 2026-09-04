#!/usr/bin/env python3
"""预览视觉验证：要求的视口/主题矩阵 + 交互状态 + 水平溢出断言"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

PREVIEWS = {
    "1": "preview-1-default-session.html",
    "2": "preview-2-live-execution.html",
    "3": "preview-3-on-demand-capabilities.html",
}
OUT = Path(__file__).parent / "shots"
VP1440 = {"width": 1440, "height": 900}
VP1024 = {"width": 1024, "height": 768}
VP390 = {"width": 390, "height": 844}


def check_overflow(page, tag):
    m = page.evaluate(
        "() => ({ sw: document.documentElement.scrollWidth,"
        " iw: window.innerWidth,"
        " bw: document.body.scrollWidth })"
    )
    ok = m["sw"] <= m["iw"] + 1 and m["bw"] <= m["iw"] + 1
    print(f"  {'✓' if ok else '✗ OVERFLOW'} {tag}: scrollW={m['sw']} innerW={m['iw']}")
    return ok


def shoot(page, name):
    OUT.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(OUT / f"{name}.png"))
    print(f"  ✓ {name}.png")


def robust_click(pg, sel):
    try:
        pg.click(sel, timeout=3000)
    except Exception as e:
        print(f"  ! real click failed on {sel}: {type(e).__name__}; using JS click")
        pg.evaluate("sel => document.querySelector(sel).click()", sel)


def scroll_stream_to_bottom(page):
    page.evaluate(
        "document.querySelectorAll('.stream,.scroller').forEach(el => el.scrollTo(0, el.scrollHeight))"
    )


def base_shot(ctx, url, name, zoom=False, focus_tabs=0, reduced=False):
    page = ctx.new_page()
    page.goto(url)
    if zoom:
        page.click("#zoomBtn")
        page.wait_for_timeout(120)
    scroll_stream_to_bottom(page)
    page.wait_for_timeout(120)
    if focus_tabs:
        for _ in range(focus_tabs):
            page.keyboard.press("Tab")
        page.wait_for_timeout(100)
        name += "-focus"
    check_overflow(page, name)
    shoot(page, name)
    page.close()
    return page


def run(preview: str):
    path = Path(__file__).parent / PREVIEWS[preview]
    url = path.resolve().as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch()

        def ctx_of(vp, scheme, reduced=False):
            return browser.new_context(
                viewport=vp, color_scheme=scheme,
                reduced_motion="reduce" if reduced else "no-preference",
            )

        # 要求矩阵
        base_shot(ctx_of(VP1440, "dark"), url, f"p{preview}-1440-dark-100")
        base_shot(ctx_of(VP1440, "dark"), url, f"p{preview}-1440-dark-150", zoom=True)
        base_shot(ctx_of(VP1440, "light"), url, f"p{preview}-1440-light-100")
        base_shot(ctx_of(VP1024, "dark"), url, f"p{preview}-1024-dark-100")
        base_shot(ctx_of(VP390, "dark"), url, f"p{preview}-390-dark-100")
        base_shot(ctx_of(VP390, "light"), url, f"p{preview}-390-light-100")
        base_shot(ctx_of(VP1440, "dark"), url, f"p{preview}-1440-dark", focus_tabs=6)
        base_shot(ctx_of(VP1440, "dark"), url, f"p{preview}-1440-dark-reduced", reduced=True)

        # 交互状态
        if preview == "1":
            ctx = ctx_of(VP1440, "dark")
            pg = ctx.new_page(); pg.goto(url)
            pg.click(".event-row[aria-controls='ev-read']")  # 展开工具事件
            pg.click("#bindingBtn")  # 打开 Binding popover
            pg.wait_for_timeout(120)
            shoot(pg, "p1-1440-dark-popover")
            check_overflow(pg, "p1-popover"); pg.close(); ctx.close()

        if preview == "2":
            ctx = ctx_of(VP1440, "dark")
            pg = ctx.new_page(); pg.goto(url)
            pg.click(".event-row[aria-controls='ev-err']")   # 展开失败差异
            pg.click("#permApprove")                          # 权限批准 → 降级
            pg.wait_for_timeout(120)
            scroll_stream_to_bottom(pg)
            shoot(pg, "p2-1440-dark-perm-resolved")
            check_overflow(pg, "p2-resolved"); pg.close(); ctx.close()
            ctx = ctx_of(VP1440, "dark")
            pg = ctx.new_page(); pg.goto(url)
            pg.click("#reconnectBtn")                         # 连接恢复 → 自动消失
            pg.wait_for_timeout(300)
            shoot(pg, "p2-1440-dark-reconnected")
            pg.close(); ctx.close()

        if preview == "3":
            ctx = ctx_of(VP1440, "dark")
            pg = ctx.new_page(); pg.goto(url)
            pg.click("#auxBtn")                               # 打开 Aux：执行历史
            pg.wait_for_timeout(120)
            shoot(pg, "p3-1440-dark-aux-history")
            pg.click("#tab-tasks")                            # 切到委派任务
            pg.wait_for_timeout(120)
            shoot(pg, "p3-1440-dark-aux-tasks")
            pg.click("#tab-history")
            robust_click(pg, "label.enode:has(input[name='exec-parent'][value='e2'])")  # 选非 head 节点 → 分支提示
            pg.wait_for_timeout(120)
            check_overflow(pg, "p3-fork")
            shoot(pg, "p3-1440-dark-fork-e2")
            # 换 Harness → continuation 由系统改判
            pg.click("#bindingBtn"); pg.select_option("#sel-harness", "cx"); pg.click("#bindingBtn")
            pg.wait_for_timeout(120)
            shoot(pg, "p3-1440-dark-fork-e2-codex")
            robust_click(pg, "label.enode:has(input[name='exec-parent'][value='e3']) .sum")
            pg.wait_for_timeout(100)
            shoot(pg, "p3-1440-dark-fork-e3-head")
            pg.close(); ctx.close()
            ctx = ctx_of(VP1440, "dark")
            pg = ctx.new_page(); pg.goto(url)
            pg.click("#termBtn")                              # 打开终端（与 Aux 互斥）
            pg.wait_for_timeout(120)
            pg.keyboard.press("ArrowRight")                   # 键盘调宽
            shoot(pg, "p3-1440-dark-terminal")
            check_overflow(pg, "p3-terminal"); pg.close(); ctx.close()
            # 移动端抽屉
            ctx = ctx_of(VP390, "dark")
            pg = ctx.new_page(); pg.goto(url)
            pg.click("#auxBtn")
            pg.wait_for_timeout(120)
            check_overflow(pg, "p3-390-drawer")
            shoot(pg, "p3-390-dark-aux-drawer")
            pg.close(); ctx.close()

        browser.close()


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "1")
