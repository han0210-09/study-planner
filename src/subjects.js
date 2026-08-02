(function (root) {
  const store = typeof require !== "undefined" ? require("./store.js") : root.SP.store;

  const FALLBACK_COLOR = "#D9D9D9";

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

  function removeSubject(state, id) {
    if (state.settings.subjects.length <= 1) return -1;
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

  // 과목 선택 드롭다운. 브라우저에서만 쓰이며 Task 8·9·10이 공유한다.
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

  const api = { FALLBACK_COLOR, find, colorOf, nameOf, countReferences, addSubject, updateSubject, removeSubject, buildSelect };

  root.SP = root.SP || {};
  root.SP.subjects = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
