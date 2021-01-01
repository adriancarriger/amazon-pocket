export default [
  {
    custom(row) {
      const needsUpdate = row.original_payee.includes('ITUNES') && Number(row.amount) === -3.18;

      if (needsUpdate) {
        row.category_title = 'Online Services';
        row.note = 'iCloud: 200GB Storage Plan';
      }

      return needsUpdate;
    },
  },
  {
    original_payee: ['ITUNES'],
    newValue: 'Entertainment',
  },
];
