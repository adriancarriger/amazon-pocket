import { Row } from '../rules.engine';
import { SimplePlugin } from '../simple.plugin';

export class CategoryPlugin extends SimplePlugin {
  public name = 'Category';

  constructor() {
    super();
    this.prepareRules();
  }

  public updateRow(row: Row, newValue) {
    row.category_title = newValue;
  }
}
