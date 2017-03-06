var express = require('express');
var router = express.Router();
var user = require('../src/user.js');

/* GET alias comparisons between a user and their VACed friends */
router.get('/:id/compare/friends', function (req, res, next) {
  var userId = req.params.id || 0;
  user.findIntersectionsWithFriends(userId).then(function (results, err) {
    if (err) res.send(err);
    else res.json(results);
  });
});

/* GET alias comparison between 2 users */
router.get('/:id1/compare/:id2', function (req, res, next) {
  var id1 = req.params.id1 || 0;
  var id2 = req.params.id2 || 0;
  user.compareUsers(id1, id2).then(function (results, err) {
    if (err) res.send(err);
    else res.json(results);
  });
});

/* GET user's friends */
router.get('/:id/friends', function (req, res, next) {
  var id = req.params.id || 0;
  user.getFriendsListData(id).then(function (friends, err) {
    if (err) res.send(err);
    else res.json(friends);
  });
});

/* GET user's banned friends */
router.get('/:id/friends/banned', function (req, res, next) {
  var id = req.params.id || 0;
  user.getBannedFriends(id).then(function (friends, err) {
    if (err) res.send(err);
    else res.json(friends);
  });
});

/* GET user's aliases */
router.get('/:id/aliases', function (req, res, next) {
  var id = req.params.id || 0;
  user.getAliasData(id).then(function (aliases, err) {
    if (err) res.send(err);
    else res.send(aliases);
  });
});

/* GET user's groups  */
router.get('/:id/groups', function (req, res, next) {
  var id = req.params.id || 0;
  user.getGroupIds(id).then(function (groups, err) {
    if (err) res.send(err);
    else res.json(groups);
  });
});

/* GET user profile XML  */
router.get('/:id/xml', function (req, res, next) {
  var id = req.params.id || 0;
  user.getProfileXml(id).then(function (result, err) {
    if (err) res.send(err);
    else res.json(result);
  });
});

// /* GET users listing. */
// router.get('/', function (req, res, next) {
//   res.send('respond with a resource');
// });

module.exports = router;
