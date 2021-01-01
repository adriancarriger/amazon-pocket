import { Row } from './rules.engine';

export function addTag(row: Row, tag: string) {
  if (!row.tags.includes(tag)) {
    row.tags.push(tag);
  }
}
