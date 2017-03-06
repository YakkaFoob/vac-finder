var request = require('request');
var Promise = require('promise');
var parseString = require('xml2js').parseString;
var token = require('../config/steamkey.json').key;
var language = require('./language');
var _ = require('lodash');

var self = module.exports = {
  getProfileXml: function (userid) {
    return new Promise(function (fulfill, reject) {
      var url = 'http://steamcommunity.com/profiles/' + userid + '/?xml=1';
      request(url, function (error, response, body) {
        if (error) {
          console.error('Could not get profile XML for: ' + userid);
          reject(error);
        } else {
          parseString(body, function (_error, result) {
            if (_error) {
              console.error('Could not get profile XML for: ' + userid);
              reject(_error);
            }
            else {
              if (!self.userDataCache[userid]) self.userDataCache[userid] = {};
              self.userDataCache[userid].profileXml = result.profile;
              fulfill(result.profile);
            }
          });
        }
      });
    });
  },

  getProfileSummary: function (userid) {
    return new Promise(function (fulfill, reject) {
      if (self.userDataCache[userid] && self.userDataCache[userid].profileSummary)
        fulfill(self.userDataCache[userid].profileSummary);
      
      var data = {
        key: token,
        steamids: [userid]
      };
      request.get({
        url: 'http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
        useQuerystring: true,
        qs: data,
        json: true,
      }, function (error, response, body) {
        if (error) reject(error);
        else {
          if (!self.userDataCache[userid]) self.userDataCache[userid] = {};
          self.userDataCache[userid].profileSummary = body.response.players[0];
          fulfill(body.response.players[0]);
        }
      });
    });
  },

  getRealName: function (userid) {
    return new Promise(function (fulfill, reject) {
      self.getProfileXml(userid).then(function (profile, err) {
        if (err) reject(err);
        else {
          return self.getRealNameFromXml(profile);
        }
      });
    });
  },

  getRealNameFromXml: function (xml) {
    var realName = xml.realName ? xml.realName[0] : '';
    return realName;
  },

  getRealNameFromSummary: function (data) {
    if (!data) return '';
    return data.realname || '';
  },

  getCustomURL: function (userid) {
    return new Promise(function (fulfill, reject) {
      self.getProfileXml(userid).then(function (profile, err) {
        if (err) reject(err);
        else {
          return self.getCustomURLFromXml(profile);
        }
      });
    });
  },

  getCustomURLFromXml: function (xml) {
    var customURL = xml.customURL ? xml.customURL[0] : '';
    return customURL;
  },

  getCustomURLFromSummary: function (data) {
    if (!data) return '';
    var urlParts = data.profileurl.split('/');
    // /id = nickname, /profiles = steamid
    return (urlParts[urlParts.length-3] == 'id') ? urlParts[urlParts.length-2] : '';
  },

  getGroupIds: function (userId) {
    return new Promise(function (fulfill, reject) {
      self.getProfileXml(userId, function (error, response, body) {
        if (error) reject(err);
        parseString(body, function (_error, result) {
          if (_error) reject(_error);
          var groups = result.profile.groups && result.profile.groups[0].group;
          groups = groups.map(function (group) {
            return group.groupID64 ? group.groupID64[0] : 0;
          });
          fulfill(groups);
        });
      });
    });
  },

  getAliasData: function (userId) {
    var url = 'http://steamcommunity.com/profiles/' + userId.toString() + '/ajaxaliases';
    return new Promise(function (fulfill, reject) {
      if (self.userDataCache[userId] && self.userDataCache[userId].aliasData)
        fulfill(self.userDataCache[userId].aliasData);

      request(url, function (error, response, body) {
        if (error) reject(error);
        else {
          var aliases = [];
          var data = JSON.parse(body);
          data.forEach(function (aliasObj) {
            aliases.push(aliasObj.newname);
          });
          if (!self.userDataCache[userId]) self.userDataCache[userId] = {};
          self.userDataCache[userId].aliasData = aliases;
          fulfill(aliases);
        }
      });
    });
  },

  getFriendsListData: function (userId) {
    var query = {
      key: token,
      steamid: userId.toString(),
      relationship: 'friend',
    };
    return new Promise(function (fulfill, reject) {
      request
        .get({
          url: 'http://api.steampowered.com/ISteamUser/GetFriendList/v0001/',
          useQuerystring: true,
          qs: query,
          json: true,
        }, function (error, response, body) {
          if (error) reject(error);
          else {
            // var friendIds = body.friendslist.friends.map(function (friend) { return friend.steamid; });
            fulfill(body.friendslist.friends);
          }
        });
    });
  },

  // TODO: pass an array of userIds to steam APIs instead of making multiple requests
  getBannedFriends: function (userId) {
    return new Promise(function (fulfill, reject) {
      self.getFriendsListData(userId).then(function (friends, err) {
        if (err) reject(err);
        else {
          var friendIds = friends.map(function (friend) {
            return friend.steamid;
          });
          var bannedFriendIds = friendIds.map(function (id) {
            return self.isBanned(id);
          });
          Promise.all(bannedFriendIds).then(function (banData) {
            var filteredIds = friendIds.filter(function (id, index) {
              return banData[index];
            });
            fulfill(filteredIds);
          })
        }
      }).catch(logError);
    });
  },

  isBanned: function (userid) {
    return new Promise(function (fulfill, reject) {
      var data = {
        key: token,
        steamids: [userid]
      };
      request.get({
        url: 'http://api.steampowered.com/ISteamUser/GetPlayerBans/v1/',
        useQuerystring: true,
        qs: data,
        json: true,
      }, function (error, response, body) {
        if (error) reject(error);
        else fulfill(body.players[0].VACBanned || body.players[0].CommunityBanned);
      });
    });
  },

  // TODO: Compare a set of users with each other
  // TODO: pass an array of userIds to steam APIs instead of making multiple requests
  compareUserSet: function (allUsers, bannedUsers) {
    var results = {};
    var comparisons = [];
    var comparisonIds = [];

    bannedUsers.forEach(function (user1) {
      allUsers.forEach(function (user2) {
        var isBanned = bannedUsers.indexOf(user2) !== -1;
        if (!isBanned && user1 != user2) {
          var comparison = self.compareUsers(user1, user2);
          comparisons.push(comparison);
          comparisonIds.push(user1);
        }
      });
    });

    Promise.all(comparisons).then(function (compareResults, err) {
      compareResults.forEach(function (result, i) {
        console.log(result)
        var matchingNames = Object.keys(result.matchingNames);
        var userId = comparisonIds[i];
        if (matchingNames.length) {
          if (!results[userId]) results[userId] = { matchingProfiles: [] };
          results[userId].matchingProfiles.push(result);
        }
      });
      console.log(results)
    });
  },

  userDataCache: {},

  compareUsers: function (userId1, userId2) {
    var user1Aliases = self.getAliasData(userId1);
    var user2Aliases = self.getAliasData(userId2);
    var user1Summary = self.getProfileSummary(userId1);
    var user2Summary = self.getProfileSummary(userId2);
    return new Promise(function (fulfill, reject) {
      Promise.all([user1Aliases, user2Aliases, user1Summary, user2Summary]).then(function (results, err) {
        if (err) reject(err);
        else {
          var user1CustomURL = self.getCustomURLFromSummary(results[2]);
          var user2CustomURL = self.getCustomURLFromSummary(results[3]);
          var user1RealName =  self.getRealNameFromSummary(results[2]);
          var user2RealName =  self.getRealNameFromSummary(results[3]);
          user1Aliases = results[0];
          user2Aliases = results[1];
          // Add custom URLs and real names to the alias list
          if (user1RealName.length) user1Aliases.push(user1RealName);
          if (user2RealName.length) user2Aliases.push(user2RealName);
          if (user1CustomURL.length) user1Aliases.push(user1CustomURL);
          if (user2CustomURL.length) user2Aliases.push(user2CustomURL);
          fulfill(self.findAliasIntersections(user1Aliases, user2Aliases));
        }
      }).catch(logError);
    });
  },

  findAliasIntersections: function (arr1, arr2) {
    // var matchSet = arr1;
    // var newMatchSet = self.accumulateMatchSet(matchSet, arr2);
    //
    // // Keep accumulating until we find all aliases to match against
    // while(matchSet.length !== newMatchSet.length) {
    //   matchSet = newMatchSet;
    //   newMatchSet = self.accumulateMatchSet(matchSet, arr2);
    // }

    var results = self.getIntersectionResults(arr1, arr2);

    return results;
  },

  getIntersectionResults: function (arr1, arr2) {
    var results = {};
    _.each(arr1, function (alias1) {
      _.each(arr2, function (alias2) {
        var testResults = self.getTestResults(alias1, alias2);
        var passesTest = self.testCriteria(testResults);
        if (passesTest) {
          var match = {
            alias: alias2,
            result: testResults
          };
          if (!results[alias1]) results[alias1] = { matches: [] };
          results[alias1].matches.push(match);
        }
      })
    });
    return results;
  },

  /*
    Look for aliases that match.
    If one or more matches are found, add the user's entire alias list
    to the list to match against.
   */
  accumulateMatchSet: function (arr1, arr2) {
    var newSet = arr1;
    var hasMatch = false;
    _.each(arr1, function (alias1) {
      _.each(arr2, function (alias2) {
        var testResults = self.getTestResults(alias1, alias2);
        var passesTest = self.testCriteria(testResults);
        if (passesTest) {
          hasMatch = true;
          return false;
        }
      })
    });
    if (hasMatch) newSet = _.union(newSet, arr2);
    return newSet;
  },

  findIntersectionsWithFriends: function (userId) {
    return new Promise(function (fulfill, reject) {
      self.getBannedFriends(userId).then(function (friendIds) {
        var friendComparisons = [];
        var resultsObj = {};
        friendIds.forEach(function (friendId) {
          friendComparisons.push(self.compareUsers(userId, friendId));
        });
        Promise.all(friendComparisons).then(function (results, err) {
          if (err) reject(err);
          results.forEach(function (result, i) {
            if (Object.keys(result).length) {
              var friendId = friendIds[i];
              var profileUrl = 'http://steamcommunity.com/profiles/' + friendId;
              resultsObj[friendId] = {profileUrl: profileUrl, matchingNames: result};
            }
          });
          fulfill(resultsObj);
        }).catch(logError);
      }).catch(logError);
    });
  },

  comparisonCriteria: {
    jwDistance: 0.8,
    jwDistanceStripped: 0.8
  },

  getTestResults: function (alias1, alias2) {
    var results = {
      jwDistance: language.getJaroWinklerDistance(alias1, alias2),
      jwDistanceStripped: language.getJaroWinklerDistance(self.stripAlias(alias1), self.stripAlias(alias2)),
      stems: alias2.tokenizeAndStem()
    };
    return results;
  },

  testCriteria: function (results, criteria) {
    var criteria = criteria || self.comparisonCriteria;

    var numParameters = Object.keys(criteria).length;
    var passCount = 0;

    for (var parameter in criteria) {
      if (results[parameter] >= criteria[parameter]) passCount++;
    }

   return (passCount == numParameters);
  },

  // Remove any non-alphanumeric characters
  stripAlias: function (alias) {
    return alias.replace(/\W/g, '').toLowerCase();
  }
}

function logError (err) {
  console.error(err);
}