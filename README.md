# Amazon + PocketSmith

⚗️ An experiment in categorizing Amazon transactions.

The original goal was to take Amazon's csv order data and match it up with actual transactions from [PocketSmith](http://pocketsmith.com). Now it also can categorize anything based on custom rules.

## Usage

- Create your own cateogrization rules or just rename `src/example-rules` to `src/rules`
- Download your orders, items, and refunds. Put them in `data` and use these names:
  - `amazon-items.csv`
  - `amazon-orders.csv`
  - `amazon-refunds.csv`
- Run `yarn && yarn once` to update your transactions

## License

This is licensed under the MIT Open Source license.
For more information, see the [LICENSE](LICENSE) file in this repository.

## Future features wishlist

- If an Amazon refund has a shipping charge, reflect that amount and categorize it as shipping or similar
