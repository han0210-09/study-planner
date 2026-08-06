(function (root) {
  const SP = (root.SP = root.SP || {});
  const dt = SP.datetime;
  const storeApi = SP.store;
  const subjectsApi = SP.subjects;
  const ui = SP.ui;

  // 일정표를 그림으로 내보내고 종이로 뽑는다.
  //
  // 화면을 그대로 찍지 않고 캔버스에 다시 그린다. 화면 것은 폰 너비에 맞춰
  // 글자가 잘리고 손잡이 같은 것이 함께 찍힌다. 여기서 그리는 것은 "읽을
  // 사람"을 위한 그림이라, 만질 것은 빼고 읽을 것만 넣는다.

  const W = 900;          // 그림 너비
  const PAD = 40;
  const HEAD = 130;
  const HOUR = 62;        // 한 시간의 높이
  const LABEL_W = 74;

  const INK = "#2B2A23";
  const MUTED = "#7C7362";
  const LINE = "#E2D9C6";
  const PAPER = "#FFFCF5";
  const ACCENT = "#3E8E5A";

  // 시간표에 블록이 있으면 그 범위만, 없으면 아침부터 밤까지.
  function rangeOf(blocks) {
    if (!blocks || blocks.length === 0) return { from: 540, to: 1380 };
    let from = Math.floor(Math.min.apply(null, blocks.map((b) => b.start)) / 60) * 60;
    let to = Math.ceil(Math.max.apply(null, blocks.map((b) => b.end)) / 60) * 60;
    // 너무 얇으면 읽기 어렵다. 최소 여섯 시간은 보여준다.
    if (to - from < 360) to = Math.min(dt.DAY_END, from + 360);
    return { from, to };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // 한 줄이 칸을 넘으면 잘라내고 말줄임을 붙인다. 캔버스에는 줄바꿈이 없다.
  function fit(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(cut + "…").width > max) cut = cut.slice(0, -1);
    return cut + "…";
  }

  function draw(dateKey) {
    const state = SP.app.state();
    const day = SP.app.store().getDay(dateKey);
    const subjects = state.settings.subjects;
    const blocks = (day.blocks || []).slice().sort((a, b) => a.start - b.start);
    const range = rangeOf(blocks);
    const from = range.from;
    const to = range.to;
    const rows = (to - from) / 60;

    const canvas = document.createElement("canvas");
    const scale = 2; // 폰에서 봐도 흐리지 않게 두 배로 그린다
    const height = HEAD + rows * HOUR + PAD;
    canvas.width = W * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.textBaseline = "middle";

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, height);

    // ---- 머리말 ----
    ctx.fillStyle = INK;
    ctx.font = "700 32px 'Malgun Gothic', sans-serif";
    ctx.fillText(dt.formatDateKorean(dateKey), PAD, 46);

    const ratio = storeApi.doneRatio(day.blocks);
    ctx.font = "16px 'Malgun Gothic', sans-serif";
    ctx.fillStyle = MUTED;
    ctx.fillText("목표 " + dt.formatDuration(storeApi.sumPlanned(day.blocks)) +
      "   실제 " + dt.formatDuration(storeApi.sumDone(day.blocks)), PAD, 78);

    ctx.font = "700 30px 'Malgun Gothic', sans-serif";
    ctx.fillStyle = ACCENT;
    ctx.textAlign = "right";
    ctx.fillText(ratio + "%", W - PAD, 52);
    ctx.textAlign = "left";

    // 달성률 막대
    const barY = 96;
    ctx.fillStyle = "#E6DDC9";
    roundRect(ctx, PAD, barY, W - PAD * 2, 8, 4);
    ctx.fill();
    if (ratio > 0) {
      ctx.fillStyle = ACCENT;
      roundRect(ctx, PAD, barY, (W - PAD * 2) * (ratio / 100), 8, 4);
      ctx.fill();
    }

    // ---- 시간 눈금 ----
    const gridX = PAD + LABEL_W;
    const gridW = W - PAD - gridX;
    const yOf = (m) => HEAD + ((m - from) / 60) * HOUR;

    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.font = "14px 'Malgun Gothic', sans-serif";
    for (let i = 0; i <= rows; i++) {
      const y = HEAD + i * HOUR;
      ctx.beginPath();
      ctx.moveTo(gridX, y + 0.5);
      ctx.lineTo(W - PAD, y + 0.5);
      ctx.stroke();
      if (i < rows) {
        ctx.fillStyle = MUTED;
        ctx.fillText(dt.minutesToLabel(from + i * 60), PAD, y + 12);
      }
    }

    // ---- 블록 ----
    for (const b of blocks) {
      if (b.end <= from || b.start >= to) continue;
      const y = yOf(Math.max(b.start, from));
      const h = Math.max(6, yOf(Math.min(b.end, to)) - y);
      ctx.fillStyle = subjectsApi.colorOf(subjects, b.subjectId);
      roundRect(ctx, gridX + 3, y + 1, gridW - 6, h - 2, 6);
      ctx.fill();

      const name = subjectsApi.nameOf(subjects, b.subjectId);
      const label = [name, b.text].filter(Boolean).join(" · ") || "이름 없음";
      const time = dt.minutesToLabel(b.start) + "~" + dt.minutesToLabel(b.end);

      // 다 한 것에만 체크를 그린다. 종이에서는 누를 수 없으니 표시로만 둔다.
      let textX = gridX + 14;
      if (b.done) {
        ctx.fillStyle = ACCENT;
        roundRect(ctx, gridX + 12, y + h / 2 - 9, 18, 18, 5);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "700 13px 'Malgun Gothic', sans-serif";
        ctx.fillText("✓", gridX + 17, y + h / 2 + 1);
        textX = gridX + 38;
      }

      // 30분보다 짧으면 두 줄이 안 들어간다. 시각과 이름을 한 줄로 붙인다.
      ctx.fillStyle = INK;
      if (h >= 30) {
        ctx.font = "600 16px 'Malgun Gothic', sans-serif";
        ctx.fillText(fit(ctx, label, gridW - (textX - gridX) - 120), textX, y + h / 2 - 8);
        ctx.font = "13px 'Malgun Gothic', sans-serif";
        ctx.fillStyle = MUTED;
        ctx.fillText(time, textX, y + h / 2 + 10);
      } else {
        ctx.font = "600 12px 'Malgun Gothic', sans-serif";
        ctx.fillText(fit(ctx, time + "  " + label, gridW - (textX - gridX) - 20), textX, y + h / 2);
      }
    }

    // ---- 메모 ----
    if (day.memo) {
      ctx.fillStyle = MUTED;
      ctx.font = "14px 'Malgun Gothic', sans-serif";
      const flat = day.memo.split(/\s+/).join(" ");
      ctx.fillText(fit(ctx, "메모  " + flat, W - PAD * 2), PAD, height - PAD + 6);
    }

    return canvas;
  }

  function fileName(dateKey) {
    return "일정표-" + dateKey + ".png";
  }

  // 폰에서는 내려받기보다 공유 창이 낫다. 사진첩·메신저로 바로 보낼 수 있다.
  // 공유를 못 하는 곳에서는 내려받기로 떨어진다.
  async function saveImage(dateKey) {
    const canvas = draw(dateKey);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) { ui.toast("그림을 만들지 못했습니다."); return; }
    const name = fileName(dateKey);
    if (typeof File === "function" && navigator.canShare) {
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
          return;
        } catch (e) {
          // 공유 창을 그냥 닫은 것이면 내려받기까지 할 이유가 없다.
          if (e && e.name === "AbortError") return;
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = ui.el("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.toast("그림으로 저장했습니다.");
  }

  // 인쇄도 같은 그림을 쓴다. 화면을 그대로 뽑으면 손잡이와 탭까지 찍힌다.
  function print(dateKey) {
    const canvas = draw(dateKey);
    const img = ui.el("img", { src: canvas.toDataURL("image/png"), alt: "일정표" });
    const host = ui.el("div", { class: "print-sheet" }, [img]);
    document.body.appendChild(host);

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      host.remove();
      window.removeEventListener("afterprint", cleanup);
    }
    window.addEventListener("afterprint", cleanup);
    // 그림이 붙기 전에 인쇄창이 뜨면 빈 종이가 나온다.
    if (img.complete) setTimeout(() => window.print(), 0);
    else img.onload = () => window.print();
    // afterprint 를 안 보내는 브라우저가 있다. 남은 그림을 뒤에서 치운다.
    setTimeout(cleanup, 60000);
  }

  const api = { draw, rangeOf, fit, fileName, saveImage, print };
  SP.export = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
