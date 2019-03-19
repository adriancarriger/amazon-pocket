import { SimplePlugin } from '../simple.plugin';

export class CategoryPlugin extends SimplePlugin {
  public name = 'Category';

  constructor() {
    super();
    this.prepareRules();
  }

  public updateRow(row, newValue) {
    row.category_title = newValue;
  }
}
