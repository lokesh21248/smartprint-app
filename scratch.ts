const arr: (string | null | undefined)[] = ["a", null, "b", undefined];
const filtered = arr.filter(Boolean);
const joined = filtered.join(" ");
