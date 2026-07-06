const COST_COLUMNS = {
  distance: {
    walk: ['cost', 'reverse_cost'],
    bike: ['cost', 'reverse_cost'],
    drive: ['cost', 'reverse_cost'],
  },
  time: {
    walk: ['walk_cost_s', 'reverse_walk_cost_s'],
    bike: ['bike_cost_s', 'reverse_bike_cost_s'],
    drive: ['drive_cost_s', 'reverse_drive_cost_s'],
  },
};

function getCostColumns(mode, costType) {
  return COST_COLUMNS[costType]?.[mode] || COST_COLUMNS.distance.walk;
}

function edgeSql(mode, costType, options = {}) {
  const effectiveCostType = options.hasTimeCosts === false ? 'distance' : costType;
  const [cost, reverseCost] = getCostColumns(mode, effectiveCostType);
  const positivePredicate = costType === 'distance'
    ? 'COALESCE(cost, length_m, 0) > 0'
    : `COALESCE(${cost}, 0) > 0`;
  const barrierFilter = options.respectBarriers !== false && options.hasBlockedEdges !== false
    ? `AND NOT EXISTS (
        SELECT 1 FROM blocked_edges be
        WHERE be.edge_id = roads.id AND (be.mode = '${mode}' OR be.mode = 'all')
      )`
    : '';

  return `
    SELECT
      id,
      source,
      target,
      COALESCE(${cost}, cost, length_m) AS cost,
      COALESCE(${reverseCost}, reverse_cost, length_m) AS reverse_cost
    FROM roads
    WHERE ${positivePredicate}
    ${barrierFilter}
  `;
}

module.exports = { getCostColumns, edgeSql };
