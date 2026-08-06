(function (root) {
  const store = typeof require !== "undefined" ? require("./store.js") : root.SP.store;

  // 과목 없는 블록의 색. 베이지 바탕 위라 차가운 회색은 때가 탄 것처럼 보인다.
  const FALLBACK_COLOR = "#E4DCCA";

  // 새 과목에 붙일 색. 처음 켜면 과목이 하나도 없으므로, 만들 때마다 여기서
  // 아직 안 쓴 색을 골라 준다. 색을 고르는 일부터 시키면 과목 하나 만드는 데
  // 손이 두 번 간다. 베이지·녹색 바탕에서 서로 구별되는 것들이다.
  const PALETTE = [
    "#F6DFA8", "#C7E3B0", "#F3C4BC", "#B9D8E8",
    "#D9CCEC", "#F2D2AE", "#AFDCCB", "#E8C9DC",
  ];

  function nextColor(list) {
    const used = new Set((list || []).map((s) => s.color));
    return PALETTE.find((c) => !used.has(c)) || PALETTE[(list || []).length % PALETTE.length];
  }

  function find(list, id) {
    if (!id || !Array.isArray(list)) return null;
    return list.find((s) => s.id === id) || null;
  }

  function colorOf(list, id) {
    const s = find(list, id);
    return s ? s.color : FALLBACK_COLOR;
  }

  function nameOf(list, id) {
    const s = find(list, id);
    return s ? s.name : "";
  }

  function countReferences(state, id) {
    let count = 0;
    for (const day of Object.values(state.days)) {
      for (const t of day.todos) if (t.subjectId === id) count++;
      for (const b of day.blocks) if (b.subjectId === id) count++;
    }
    return count;
  }

  function addSubject(state, name, color) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const created = { id: store.newId(), name: trimmed, color: color || FALLBACK_COLOR };
    state.settings.subjects.push(created);
    return created;
  }

  function updateSubject(state, id, patch) {
    const s = find(state.settings.subjects, id);
    if (!s) return false;
    if (typeof patch.name === "string" && patch.name.trim()) s.name = patch.name.trim();
    if (typeof patch.color === "string") s.color = patch.color;
    return true;
  }

  // 마지막 하나까지 지울 수 있다. 과목이 하나도 없는 것이 처음 켠 상태이고,
  // 과목 없이도 할 일과 블록은 그대로 쓸 수 있다.
  function removeSubject(state, id) {
    const index = state.settings.subjects.findIndex((s) => s.id === id);
    if (index === -1) return -1;
    state.settings.subjects.splice(index, 1);
    let affected = 0;
    for (const day of Object.values(state.days)) {
      for (const t of day.todos) if (t.subjectId === id) { t.subjectId = null; affected++; }
      for (const b of day.blocks) if (b.subjectId === id) { b.subjectId = null; affected++; }
    }
    return affected;
  }

  // 과목 선택 드롭다운. 브라우저에서만 쓰인다.
  function buildSelect(list, selectedId) {
    const select = document.createElement("select");
    select.className = "subject-select";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "과목 없음";
    none.selected = !selectedId;
    select.appendChild(none);
    for (const s of list) {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = s.name;
      option.selected = s.id === selectedId;
      select.appendChild(option);
    }
    return select;
  }

  // 고르는 자리에서 바로 만들 수 있는 과목 칸. 목록이 비어 있는 채로 시작하니,
  // 만들려면 설정까지 들어갔다 나와야 한다면 아무도 안 만든다.
  //
  // .value 를 읽는 쪽은 예전 <select> 와 똑같이 쓰면 된다.
  function subjectField(state, selectedId) {
    const NEW = "__new__";
    const wrap = document.createElement("div");
    wrap.className = "subject-field";
    let current = selectedId || "";

    function paint() {
      wrap.textContent = "";
      const select = buildSelect(state.settings.subjects, current);
      const add = document.createElement("option");
      add.value = NEW;
      add.textContent = "＋ 새 과목 만들기";
      select.appendChild(add);
      select.addEventListener("change", () => {
        if (select.value !== NEW) { current = select.value; return; }
        // 고른 것으로 치지 않는다. 이름을 넣고 확인해야 과목이 생긴다.
        select.value = current;
        openNew();
      });
      wrap.appendChild(select);
    }

    function openNew() {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "subject-new-name";
      input.placeholder = "과목 이름";
      input.maxLength = 12;

      const swatch = document.createElement("input");
      swatch.type = "color";
      swatch.value = nextColor(state.settings.subjects);

      const done = document.createElement("button");
      done.type = "button";
      done.className = "btn btn-primary subject-new-ok";
      done.textContent = "추가";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-ghost subject-new-cancel";
      cancel.textContent = "취소";

      function commit() {
        const made = addSubject(state, input.value, swatch.value);
        if (!made) { input.focus(); return; }
        current = made.id;
        if (root.SP && root.SP.app) root.SP.app.persist();
        paint();
      }
      done.addEventListener("click", commit);
      cancel.addEventListener("click", paint);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });

      const row = document.createElement("div");
      row.className = "subject-new";
      row.append(swatch, input, done, cancel);
      wrap.textContent = "";
      wrap.appendChild(row);
      input.focus();
    }

    paint();
    return {
      node: wrap,
      get value() { return current; },
      // 할 일을 고르면 그 과목을 따라 바뀐다(블록 편집 시트). 다시 그려야
      // 드롭다운에 고른 표시가 남는다.
      set value(next) { current = next || ""; paint(); },
    };
  }

  const api = { FALLBACK_COLOR, PALETTE, nextColor, find, colorOf, nameOf, countReferences, addSubject, updateSubject, removeSubject, buildSelect, subjectField };

  root.SP = root.SP || {};
  root.SP.subjects = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
