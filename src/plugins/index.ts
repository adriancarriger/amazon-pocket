import { AmazonPlugin } from './amazon.plugin';
import { NamePlugin } from './name.plugin';
import { CategoryPlugin } from './category.plugin';
import { LabelPlugin } from './label.plugin';
import { NotePlugin } from './note.plugin';

export default async () => {
  const amazon = new AmazonPlugin();
  const name = new NamePlugin();
  const label = new LabelPlugin();
  const cateogory = new CategoryPlugin();
  const note = new NotePlugin();

  await amazon.loadAmazonOrders();

  return [amazon, name, cateogory, label, note];
};
