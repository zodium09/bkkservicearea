function featureCollection(features = [], properties = undefined) {
  const collection = { type: 'FeatureCollection', features };
  if (properties) collection.properties = properties;
  return collection;
}

function isFeatureCollection(value) {
  return value && value.type === 'FeatureCollection' && Array.isArray(value.features);
}

module.exports = { featureCollection, isFeatureCollection };
