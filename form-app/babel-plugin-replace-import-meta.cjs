// Babel plugin to replace import.meta with a polyfill for Android 9
module.exports = function() {
  return {
    name: 'replace-import-meta',
    visitor: {
      MetaProperty(path) {
        if (
          path.node.meta.name === 'import' &&
          path.node.property.name === 'meta'
        ) {
          // Replace import.meta with an empty object
          path.replaceWithSourceString('({})');
        }
      },
    },
  };
};
