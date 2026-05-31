try {
    module.exports = require('../../build/Release/nes_core.node');
} catch (e) {
    console.warn('Native NES core not available, using JavaScript fallback');
    module.exports = require('./js-fallback');
}
