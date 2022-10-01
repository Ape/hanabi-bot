const { CLUE } = require('../../../constants.js');
const { find_chop } = require('./../hanabi-logic.js');
const { find_playables, find_known_trash } = require('../../../basics/helper.js');
const { logger } = require('../../../logger.js');
const Basics = require('../../../basics.js');
const Utils = require('../../../util.js');

// Determines if the clue is safe to give (i.e. doesn't put a critical on chop with nothing to do)
function clue_safe(state, clue) {
	const { type, value, target } = clue;
	const hypo_state = Utils.objClone(state);

	let list;
	if (type === CLUE.COLOUR) {
		list = hypo_state.hands[target].filter(c => c.suitIndex === value).map(c => c.order);
	}
	else {
		list = hypo_state.hands[target].filter(c => c.rank === value).map(c => c.order);
	}
	const action = { giver: state.ourPlayerIndex, target, list, clue, mistake: false };

	logger.setLevel(logger.LEVELS.ERROR);
	hypo_state.ourPlayerIndex = target;
	Basics.onClue(hypo_state, action);
	hypo_state.interpret_clue(hypo_state, action);
	logger.setLevel(logger.LEVELS.INFO);

	const hand = hypo_state.hands[target];
	const playable_cards = find_playables(hypo_state.play_stacks, hand);
	const trash_cards = find_known_trash(hypo_state, target);

	// They won't discard next turn
	if (playable_cards.length + trash_cards.length > 0) {
		return true;
	}

	// Note that chop will be undefined if the entire hand is clued
	const chop = hand[find_chop(hand, { includeNew: true })];
	logger.info(`chop after clue is ${chop?.toString()}`);

	let give_clue = true;

	// New chop is critical
	if (chop !== undefined && Utils.isCritical(hypo_state, chop.suitIndex, chop.rank)) {
		logger.error(`Not giving clue ${Utils.logClue(clue)}, as ${chop.toString()} is critical.`);
		give_clue = false;
	}

	// Locked hand and no clues
	if (chop === undefined && hypo_state.clue_tokens === 0) {
		logger.error(`Not giving clue ${Utils.logClue(clue)}, as hand would be locked with no clues.`);
		give_clue = false;
	}

	return give_clue;
}

module.exports = { clue_safe };