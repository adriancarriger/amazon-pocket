export function addTag(row, tag) {
  if (!row.tags.includes(tag)) {
    row.tags.push(tag);
  }
}
