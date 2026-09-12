/** Edge a tile docks against main when it first joins the tree. Shared by
 *  session tiles and route (page) tiles. */
export type SplitDir = 'bottom' | 'left' | 'right' | 'top'

/** Where a tile lands on adoption: an edge split, or `center` = stack into
 *  the anchor's zone as a tab (a drop on the zone's tab strip). */
export type TileDock = 'center' | SplitDir
