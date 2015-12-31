
/*
* Characters.js controls everything dealing with a 'Character' which includes in game creatures.
* No in game commands are defiend here; Commands.js does share some function names with this module, 
* see: save().
*/
'use strict';
var fs = require('fs'),
crypto = require('crypto'),
Room = require('./rooms').room,
World = require('./world').world,
Character = function () {

};

Character.prototype.login = function(r, s, fn) {
	var name = r.msg.replace(/_.*/,'').toLowerCase();
	
	if (r.msg.length > 2) {
		if  (/^[a-z]+$/g.test(r.msg) === true && /[`~@#$%^&*()-+={}[]|]+$/g.test(r.msg) === false) {
			fs.stat('./players/' + name + '.json', function (err, stat) {
				if (err === null) {
					return fn(name, s, true);
				} else {
					return fn(name, s, false);
				}
			});
		} else {
			return s.emit('msg', {msg : '<b>Invalid Entry</b>. Enter your name:', res: 'login', styleClass: 'enter-name'});
		}
	} else {
		s.emit('msg', {
			msg: 'Invalid name choice, must be more than two characters.',
			res: 'login',
			styleClass: 'error'
		});
	}
};

Character.prototype.load = function(name, s, fn) {
	fs.readFile('./players/'  + name + '.json', function (err, r) {
		if (err) {
			throw err;
		}
		
		s.player = JSON.parse(r);

		s.player.name = s.player.name.charAt(0).toUpperCase() + s.player.name.slice(1);

		if (s.player.lastname !== '') {
			s.player.lastname = s.player.lastname = s.player.lastname.charAt(0).toUpperCase() + s.player.lastname.slice(1);
		}

		s.player.sid = s.id;
		
		return fn(s);
	});
};

Character.prototype.hashPassword = function(salt, password, iterations, fn) {
	var hash = password,
	i = 0;
		
	for (i; i < iterations; i += 1) {
		hash = crypto.createHmac('sha512', salt).update(hash).digest('hex');
	} 
			
	return fn(hash);
};

Character.prototype.generateSalt = function(fn) {
	crypto.randomBytes(128, function(ex, buf) {
		if (ex) {
			throw ex;
		}
			
		fn(buf.toString('hex'));
	});
};

Character.prototype.getPassword = function(s, fn) {
	var character = this;
	s.emit('msg', {msg: 'What is your password: ', res: 'enterPassword'});

	s.on('password', function (r) {
		if (r.msg.length > 7) {
			character.hashPassword(s.player.salt, r.msg, 1000, function(hash) {
				if (s.player.password === hash) {
					character.addPlayer(s, function(added, msg) {
						if (added) {
								World.motd(s, function() {
									World.getRoomObject(s.player.area, s.player.roomid, function(roomObj) {
										roomObj.playersInRoom.push(s.player);

										Room.getDisplayHTML(roomObj, {
											hideCallingPlayer: s.player.name
										},function(displayHTML, roomObj) {
											World.msgPlayer(s, {
												msg: displayHTML,
												styleClass: 'room'
											});

											fn(s);
										});
									});
								});
						} else {
							if (msg === undefined) {
								s.emit('msg', {msg: 'Error logging in, please retry.'});
								return s.disconnect();
							} else {
								s.emit('msg', {msg: msg});
								s.emit('msg', {msg : 'Enter your name:', res: 'login', styleClass: 'enter-name'});
							}
						}
					});
				} else {
					s.emit('msg', {msg: 'Wrong! You are flagged after 5 incorrect responses.', res: 'enterPassword'});
					return s.emit('msg', {msg: 'What is your password: ', res: 'enterPassword'});
				}
			});
		} else {
			s.emit('msg', {msg: 'Password has to be over eight characters.', res: 'enterPassword'});
			return s.emit('msg', {msg: 'What is your password: ', res: 'enterPassword'});
		}
	});
};

// Add a player reference object to the players array
Character.prototype.addPlayer = function(s, fn) {
	var i = 0;

	for (i; i < World.players.length; i += 1) {
		if (s.player.name === World.players[i].name) {
			return fn(false, 'Already Logged in. Disconnecting. Refresh the page and try to login again.');
		}
	}
	
	World.players.push({
		name: s.player.name,
		sid: s.id,
		area: s.player.area,
		roomid: s.player.roomid
	});

	return fn(true);
};

// A New Character is saved
Character.prototype.create = function(r, s, fn) { 
	var character = this;

	s.player.displayName = s.player.name[0].toUpperCase() + s.player.name.slice(1);
	s.player.hp += 100;
	s.player.chp += 100;
	s.player.mana += 100;
	s.player.cmana += 100;
	s.player.mv += 100;
	s.player.cmv += 100;
	s.player.isPlayer = true;
	s.player.salt = '';
	s.player.created = new Date();
	s.player.saved = null;
	s.player.role = 'player';
	s.player.area = 'Midgaard';
	s.player.roomid = 1;
	s.player.trains += 25;
	s.player.deaths = 0;
	s.player.settings = {
		autosac: false,
		autoloot: true,
		autodrink: {enabled: true, itemId: ''},
		wimpy: {enabled: false, hp: 0},
		channels: {
			blocked: ['flame']
		}
	};

	character.rollStats(s.player, function(player) {
		s.player = player;
		character.generateSalt(function(salt) {
			s.player.salt = salt;
			character.hashPassword(salt, s.player.password, 1000, function(hash) {
				s.player.password = hash;

				fs.writeFile('./players/' + s.player.name + '.json', JSON.stringify(s.player, null, 4), function (err) {
					var i = 0;

					if (err) {
						throw err;
					}

					s.player.saved = new Date();

					character.addPlayer(s, function(added) {
						if (added) {
							s.leave('creation'); // No longer creating the character so leave the channel and join the game
							s.join('mud');

							World.motd(s, function() {
								Room.getDisplay(s.player.area, s.player.roomid, function(displayHTML, roomObj) {
									World.getRoomObject(s.player.area, s.player.roomid, function(roomObj) {
										roomObj.playersInRoom.push(s.player);
										Room.getDisplayHTML(roomObj, {
											hideCallingPlayer: s.player.name
										},function(displayHTML, roomObj) {
											World.msgPlayer(s, {
												msg: displayHTML,
												styleClass: 'room'
											});
											fn(s);
										});
									});

								});
							});
						
						} else {
							s.emit('msg', {msg: 'Error logging in, please retry.'});
							s.disconnect();
						}
					});
				});
			});
		});
	});
};

// Rolling stats for a new character
Character.prototype.rollStats = function(player, fn) { 
	var i = 0,
	j = 0,
	raceKey, // property of the race defines in raceList
	classKey; // property of the class defines in classList

	for (i; i < World.races.length; i += 1) {// looking for race
		if (World.races[i].name.toLowerCase() === player.race) { // found race
			for (raceKey in player) {
				if (player[raceKey] in World.races[i] && raceKey !== 'name') { // found, add in stat bonus
						player[player[raceKey]] = player[player[raceKey]] + World.races[i][player[raceKey]];
				}
			}
		}
	}

	for (j; j < World.classes.length; j += 1) { // looking through classes
		if (World.classes[j].name.toLowerCase() === player.charClass) { // class match found
			for (classKey in player) {
				if (classKey in World.classes[j] && classKey !== 'name') {
					if (!World.classes[j][classKey].length) {
						player[classKey] = World.classes[j][classKey] + player[classKey];
					} else {
						player[classKey].push(World.classes[j][classKey]);
					}
				} 
			}
		}
	}

	player.carry = player.str * 10;
	player.ac = World.dice.getDexMod(player) + 2;

	return fn(player);
};

Character.prototype.newCharacter = function(r, s, fn) {
	var character = this,
	i = 0,
	str = '';

	World.getPlayableRaces(function(races) {
		World.getPlayableClasses(function(classes) {
			for (i; i < races.length; i += 1) {
				str += '<li class="race-list-'+ races[i].name + '">' + races[i].name + '</li>';

				if	(races.length - 1 === i) {
					s.emit('msg', {msg: s.player.name + ' is a new character! There are three more steps until ' + s.player.name + 
					' is saved. The <strong>first step</strong> is to select your race: <ul>' + str + '</ul><p class="tip">You can learn more about each race by typing help race name</p>', res: 'selectRace', styleClass: 'race-selection'});		

					s.on('raceSelection', function (r) { 
						var cmdArr = r.msg.split(' ');

						r.cmd = cmdArr[0].toLowerCase();
						r.msg = cmdArr.slice(1).join(' ');
			
						character.raceSelection(r, s, function(r, s, fnd) {
							if (fnd) {
								i = 0;
								str = '';
								s.player.race = r.cmd;

								for (i; i < classes.length; i += 1) {
									str += '<li>' + classes[i].name + '</li>';

									if	(classes.length - 1 === i) {
										s.emit('msg', {
											msg: 'Great, <strong>two more steps to go!</strong> Now time to select a class for ' + s.player.name + '. Pick one of the following: <ul>' + 
											str + '</ul>', 
											res: 'selectClass', 
											styleClass: 'race-selection'
										});
										
										s.on('classSelection', function(r) {
											r.msg = r.msg.toLowerCase();

											character.classSelection(r, function(fnd) {
												if (fnd) {
													s.player.charClass = r.msg;
													
													s.emit('msg', {
														msg: s.player.name + ' is a ' + s.player.charClass + '! <strong>One more step before ' + s.player.name + 
														' is saved</strong>. Please define a password (8 or more characters):', 
														res: 'createPassword', 
														styleClass: 'race-selection'
													});
										
													s.on('setPassword', function(r) {
														if (r.msg.length > 7) {
															s.player.password = r.msg;
															character.create(r, s, fn);
														} else {
															s.emit('msg', {msg: 'Password should be longer', styleClass: 'error' });
														}
													});
												} else {
													s.emit('msg', {msg: 'That class is not on the list, please try again', styleClass: 'error' });
												}
											}); 
										});
									}
								}
							} else if (!fnd && r.cmd !== 'help') {
								s.emit('msg', {msg: 'That race is not on the list, please try again', styleClass: 'error' });
							}
						});
					});
				}
			}
		});
	});
};

Character.prototype.raceSelection = function(r, s, fn) {
	var i = 0,
	helpTxt;

	if (r.cmd !== 'help') {
		World.getPlayableRaces(function(races) {
			for (i; i < races.length; i += 1) {
				if (r.cmd === races[i].name.toLowerCase()) {
					return fn(r, s, true);
				}
			}

			return fn(r, s, false);
		});
	} else {
		fs.readFile('./help/' + r.msg + '.json', function (err, data) {
			if (!err) {
				data = JSON.parse(data);

				helpTxt = '<h2>Race Profile: ' + data.name + '</h2> ' + data.description + 
				'<h3>Benefits:</h3><p class="small">Related: '+ data.related.toString() + '</p>';

				s.emit('msg', {msg: helpTxt, styleClass: 'cmd-help' });

				return fn(r, s, false);
			} else {
				s.emit('msg', {msg: 'No help file found for this race.', styleClass: 'error' });

				return fn(r, s, false);
			}
		});
	}
};

Character.prototype.classSelection = function(r, fn) {
	var i = 0;

	World.getPlayableClasses(function(classes) {
		for (i; i < classes.length; i += 1) {
			if (r.msg === classes[i].name.toLowerCase()) {
				return fn(true)
			}
		}

		return fn(false);
	});
};

Character.prototype.save = function(player, fn) {
	var character = this;

	player.modified = new Date().toString();

	fs.writeFile('./players/' + player.name.toLowerCase() + '.json', JSON.stringify(player, null, 4), function (err) {
		if (err) {
			return World.msgPlayer(player, {msg: 'Error saving character.'});
		} else {
			character.updatePlayer(player, function() {
				if (typeof fn === 'function') {
					return fn();
				}
			})
		}
	});
};

Character.prototype.hpRegen = function(target, fn) {
	var conMod = World.dice.getConMod(target);

	// unless the charcter is a fighter they have 
	// a 10% chance of skipping hp regen

	if (target.chp < target.hp && target.thirst < 5 && target.hunger < 6) {
		if (target.position === 'sleeping') {
			conMod += 3;
		} else {
			conMod += 1;
		}


		if (target.thirst >= 3 || target.hunger >= 3) {
			conMod -= 1;
		}

		World.dice.roll(conMod, 4, function(total) {
			total = total + target.level;

			target.chp += total;

			if (target.chp > target.hp) {
				target.chp = target.hp;
			}

			fn(target, total);
		});
	} else {
		fn(target, 0);
	}
};

Character.prototype.manaRegen = function(target, fn) {
	var intMod = World.dice.getIntMod(target);

	if (target.cmana < target.mana && target.thirst < 5 && target.hunger < 6) {
		// unless the charcter is a wizard they have 
		// a 10% chance of skipping mana regen

		if (target.position === 'sleeping') {
			intMod += 2;
		} else {
			intMod += 1;
		}

		if (target.thirst >= 3 || target.hunger >= 3) {
			intMod -= 1;
		}

		World.dice.roll(intMod, 8, function(total) {
			total = total + target.level;

			target.chp += total;

			if (target.cmana  > target.mana ) {
				target.cmana  = target.mana ;
			}

			fn(target, total);
		});
	} else {
		fn(target, 0);
	}
};

Character.prototype.mvRegen = function(target, fn) {
	var dexMod = World.dice.getDexMod(target);

	// unless the charcter is a thief they have 
	// a 10% chance of skipping move regen

	if (target.cmv < target.mv && target.thirst < 5 && target.hunger < 6) {
		if (target.position === 'sleeping') {
			dexMod += 3;
		} else {
			dexMod += 1;
		}

		if (target.thirst >= 3 || target.hunger >= 3) {
			dexMod -= 1;
		}

		World.dice.roll(dexMod, 8, function(total) {
			target.cmv += total;

			if (target.cmv > target.mv) {
				target.cmv = target.mv;
			}

			fn(target, total);
		});
	} else {
		fn(target, 0);
	}
};

Character.prototype.hunger = function(target, fn) {
	var character = this,
	conMod = World.dice.getConMod(target);

	if (target.hunger < 10) {
		World.dice.roll(1, conMod, function(total) {
			if (total >= conMod - 2) {
				target.hunger += 1;
			}

			if (target.hunger >= 5) {
				target.chp -= World.dice.roll(1, 10 + target.hunger) - conMod;

				if (target.chp < target.hp) {
					target.chp = 0;
				}

				World.msgPlayer(target, {msg: 'You feel hungry.', styleClass: 'hunger'});
			}

			fn(target);
		});
	} else {
		target.chp -= World.dice.roll(1, 10 + target.level + target.hunger + 1);

		if (target.chp < target.hp) {
			target.chp = 0;
		}

		World.msgPlayer(target, {msg: 'You are dying of hunger.', styleClass: 'hunger'});
		
		fn(target);
	}
};

Character.prototype.thirst = function(target, fn) {
	var character = this,
	dexMod = World.dice.getDexMod(target);

	if (target.thirst < 10) {
		World.dice.roll(1, 5, function(total) {
			if (total >= dexMod - 2) {
				target.thirst += 1;
			}

			if (target.thirst >= 5) {
				target.chp -= World.dice.roll(1, 10 + target.thirst) - dexMod;

				if (target.chp < target.hp) {
					target.chp = 0;
				}

				World.msgPlayer(target, {msg: 'You could use something to drink.', styleClass: 'hunger'});
			}

			fn(target);
		});	
	} else {
		target.chp -= World.dice.roll(1, 10 + target.level + target.thirst + 1);

		if (target.chp < target.hp) {
			target.chp = 0;
		}

		World.msgPlayer(target, {msg: 'You are dying of thirst.', styleClass: 'thirst'});

		fn(target);
	}
};

// Removes experience and gained levels from character
Character.prototype.xpRot = function() {

};

// push an item into a players inventory, checks items to ensure a player can use it
Character.prototype.addToInventory = function(item, player, fn) {
	player.items.push(item);
	fn(true);
};

/*
* Returns all items that meet the query criteria, could be optimized if your
* slots are consistent.
*/
Character.prototype.getWeaponSlots = function(player, fn) {
	var i = 0,
	weapons = [];

	for (i; i < player.eq.length; i += 1) {
		if (player.eq[i].slot === 'hands' && player.eq[i].item !== null 
			&& player.eq[i].item.itemType === 'weapon') {
			weapons.push(player.eq[i]);
		}
	}

	if (typeof fn === 'function') {
		return fn(weapons);
	} else {
		return weapons;
	}
};

Character.prototype.removeItem = function(item, roomObj, fn) {
	World.remove('items', item, roomObj, function(roomObj, item) {
		return fn(true, item, roomObj);
	});
};

Character.prototype.removeEq  = function(item, player, fn) {
	World.remove('eq', item, player, function(removed, player, item) {
		return fn(true, item, player);
	});
};

Character.prototype.getItem = function(eqArr, command, fn) {
	World.search(eqArr, command, function(slot) {
		return fn(slot.item)
	});
};

Character.prototype.wear = function(target, item, fn) {
	var i = 0,
	replacedItem;

	for (i; i < target.eq.length; i += 1) {   
		if (item.slot === target.eq[i].slot && item.equipped === false) {
			if (item.itemType === 'weapon') {
				item.equipped = true;

				if (item.weight < (20 + target.str)) { // Dual check

				}

				if (target.eq[i].dual === false && target.eq[i].item === null) {
					target.eq[i].item = item;

					fn('You wield a ' + item.short + ' in your ' + target.eq[i].name);
					break;
				}
			} else {
				// Wearing Armor
				if (target.eq[i].item === null) {
					item.equipped = true;
					target.eq[i].item = item;

					target.ac = target.ac + item.ac;
					
					return fn('You wear a ' + item.short + ' on your ' + target.eq[i].name);
				} else {
					item.equipped = true;
					target.eq[i].item.equipped = false;

					replacedItem = target.eq[i].item;
					target.eq[i].item = item;

					target.ac = target.ac - replacedItem.ac;

					target.ac = target.ac + item.ac

					return fn('You wear ' + item.short + ' on your ' + 
						target.eq[i].name + ' and remove ' + 
						replacedItem.short);
				}
			}
		} 
	}
};

Character.prototype.getLoad = function(s) {
	var load = Math.round((s.player.str + s.player.con / 4) * 10);
	
	return load;
};

// Updates a players reference in players[] with some data attached to the socket
Character.prototype.updatePlayer = function(player, fn) {
	var  i = 0;

	for (i; i < World.players.length; i += 1) {
		if (player.name === World.players[i].name) {
			World.players[i] = {
				name: player.name, 
				sid: player.sid,
				area: player.area,
				roomid: player.roomid
			};
			
			if (typeof fn === 'function') {
				fn(true);
			} 
		}
	}
};

Character.prototype.level = function(s, fn) {

};

// Add in gear modifiers and return the updated object
Character.prototype.calculateGear = function() {

};

module.exports.character = new Character();
