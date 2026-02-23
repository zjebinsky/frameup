# Roadmap

Ideas and growth directions for frameup.

---

## Native screen recording

Right now frameup builds videos frame by frame — it takes a screenshot, moves the scroll position, takes another screenshot, and stitches them together. It works well, but it's a simulation of a video rather than a real one.

The next step would be to flip that around: open the browser as a real window, hit record on the screen, and let the browser scroll itself.

**What we would gain:**

Real 60fps. Not simulated — the browser's GPU compositor rendering every frame at full speed, the way the page was meant to be seen. Subpixel antialiasing, smooth gradients, nothing approximated.

CSS animations that actually play. Scroll-triggered effects, parallax, hover transitions — right now these are frozen between frames. With native recording they run at full fidelity because we're capturing the live page, not snapshots of it.

Scroll that feels human. Instead of programmatically jumping the scroll position frame by frame, we'd fire `page.mouse.wheel()` and let the browser handle momentum, deceleration, and snap points natively. The result would be indistinguishable from a real person scrolling.

No ceiling. The current approach gets slower as pages get taller or more complex — more frames to capture, more screenshots to take. Native recording has no such limit. A 10,000px page records just as smoothly as a 1,000px one.
