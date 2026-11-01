import styles from './Logo.module.css';

/**
 * BMI wordmark on a mandatory white tile (DESIGN.md brand rules: logo always on
 * a white tile on dark surfaces; never placed directly on brand red, never
 * stretched/recoloured). The real raster logo asset is supplied by the brand
 * owner; until then this renders the typeset wordmark on the required white
 * tile so the placement rule is honoured. `withText` shows the product name
 * beside the tile (expanded sidebar); the tile alone is used in the collapsed
 * rail.
 */
export function Logo({ withText = true }: { withText?: boolean }): JSX.Element {
  return (
    <div className={styles.logo}>
      <span className={styles.tile} aria-hidden="true">
        BMI
      </span>
      {withText ? <span className={styles.word}>BMI Stooring System</span> : null}
    </div>
  );
}
