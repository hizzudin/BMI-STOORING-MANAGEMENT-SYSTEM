import type { ReactNode } from 'react';
import styles from './Table.module.css';

/**
 * A ruled data table — one fact per column (DESIGN.md "The One Fact Per Column
 * Rule"), hairline header rule, ruled row dividers, tabular numerals available
 * via the `.tnum` utility on numeric cells.
 */

export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: Row) => ReactNode;
  /** Right-align + tabular numerals for numeric columns. */
  readonly numeric?: boolean;
}

export function Table<Row>({
  columns,
  rows,
  getRowKey,
  caption,
}: {
  columns: ReadonlyArray<Column<Row>>;
  rows: readonly Row[];
  getRowKey: (row: Row, index: number) => string;
  /** Accessible caption describing the table (screen-reader friendly). */
  caption: string;
}): JSX.Element {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={col.numeric ? styles.numeric : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={getRowKey(row, i)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={col.numeric ? `${styles.numeric} tnum` : undefined}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
