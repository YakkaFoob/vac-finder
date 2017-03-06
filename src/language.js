var natural = require('natural');
natural.PorterStemmer.attach();

// Language processing functions
module.exports = {
  getJaroWinklerDistance: function (alias1, alias2) {
    return natural.JaroWinklerDistance(alias1, alias2);
  }
}
