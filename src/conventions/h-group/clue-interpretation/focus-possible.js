const { CLUE } = require('../../../constants.js');
const { determine_focus } = require('../hanabi-logic.js');
const { find_connecting } = require('./connecting-cards.js');
const { isCritical, playableAway, visibleFind } = require('../../../basics/hanabi-util.js');
const { logger } = require('../../../logger.js');
const Utils = require('../../../util.js');

function find_colour_focus(state, suitIndex, action) {
	const { giver, list, target } = action;
	const { focused_card, chop } = determine_focus(state.hands[target], list);

	const focus_possible = [];
	let next_playable_rank = state.play_stacks[suitIndex] + 1;

	// Play clue
	const connections = [];

	// Try looking for a connecting card (other than itself)
	const hypo_state = Utils.objClone(state);
	let already_connected = [focused_card.order];
	let connecting = find_connecting(hypo_state, giver, target, suitIndex, next_playable_rank, already_connected);

	while (connecting !== undefined && next_playable_rank < 5) {
		const { type, card } = connecting;

		if (type === 'known' && card.newly_clued && card.possible.length > 1 && focused_card.inferred.some(c => c.matches(suitIndex, next_playable_rank))) {
			// Trying to use a newly 'known' connecting card, but the focused card could be that
			// e.g. If 2 reds are clued with only r5 remaining, the focus should not connect to the other card as r6
			logger.warn(`blocked connection - focused card could be ${Utils.logCard({suitIndex, rank: next_playable_rank})}`);
			break;
		}
		else if (type === 'finesse') {
			// Even if a finesse is possible, it might not be a finesse
			focus_possible.push({ suitIndex, rank: next_playable_rank, save: false, connections: Utils.objClone(connections) });
			card.finessed = true;
		}
		hypo_state.play_stacks[suitIndex]++;

		next_playable_rank++;
		connections.push(connecting);
		already_connected.push(card.order);
		connecting = find_connecting(hypo_state, giver, target, suitIndex, next_playable_rank, already_connected);
	}

	// Our card could be the final rank that we can't find
	focus_possible.push({ suitIndex, rank: next_playable_rank, save: false, connections });

	// Save clue on chop (5 save cannot be done with number)
	if (chop) {
		for (let rank = next_playable_rank + 1; rank < 5; rank++) {
			// Determine if possible save on k2, k5 with colour
			if (state.suits[suitIndex] === 'Black' && (rank === 2 || rank === 5)) {
				let fill_ins = 0;

				for (const card of state.hands[target]) {
					if (!list.includes(card.order)) {
						continue;
					}

					if (card.newly_clued ||
						card.clues.some((clue, index) => index !== card.clues.length - 1 && Utils.objEquals(clue, card.clues.at(-1)))
					) {
						fill_ins++;
					}
				}

				// Only touched/filled in 1 new card
				if (fill_ins < 2) {
					continue;
				}
			}

			// Check if card is critical
			if (isCritical(state, suitIndex, rank)) {
				focus_possible.push({ suitIndex, rank, save: true, connections: [] });
			}
		}
	}
	return focus_possible;
}

function find_rank_focus(state, rank, action) {
	const { giver, list, target } = action;
	const { focused_card, chop } = determine_focus(state.hands[target], list);

	const focus_possible = [];
	for (let suitIndex = 0; suitIndex < state.suits.length; suitIndex++) {
		// Play clue
		let stack_rank = state.play_stacks[suitIndex] + 1;
		const connections = [];

		if (rank === stack_rank) {
			focus_possible.push({ suitIndex, rank, save: false, connections });
		}
		else if (rank > stack_rank) {
			// Try looking for all connecting cards
			const hypo_state = Utils.objClone(state);
			let connecting;
			const already_connected = [focused_card.order];

			while (stack_rank !== rank) {
				connecting = find_connecting(hypo_state, giver, target, suitIndex, stack_rank, already_connected);
				if (connecting === undefined) {
					break;
				}

				const { type, card } = connecting;
				connections.push(connecting);
				already_connected.push(card.order);

				if (type === 'finesse') {
					card.finessed = true;
				}
				stack_rank++;
				hypo_state.play_stacks[suitIndex]++;
			}

			// Connected cards can stack up to this rank
			if (rank === stack_rank) {
				focus_possible.push({ suitIndex, rank, save: false, connections });
			}
		}

		// Save clue on chop
		if (chop) {
			// Don't need to consider save on playable cards
			if (playableAway(state, suitIndex, rank) === 0) {
				continue;
			}

			// Don't consider save on k3, k4 with rank
			if (state.suits[suitIndex] === 'Black' && (rank === 3 || rank === 4)) {
				continue;
			}

			const save2 = rank === 2 &&
				visibleFind(state, giver, suitIndex, 2).filter(c => c.order !== focused_card.order).length === 0;

			// Critical save or 2 save
			if (isCritical(state, suitIndex, rank) || save2) {
				focus_possible.push({ suitIndex, rank, save: true, connections: [] });
			}
		}
	}
	return focus_possible;
}

function find_focus_possible(state, action) {
	const { clue } = action;
	logger.info('play/hypo/max stacks in clue interpretation:', state.play_stacks, state.hypo_stacks, state.max_ranks);

	let focus_possible = [];

	if (clue.type === CLUE.COLOUR) {
		if (state.suits.includes('Rainbow')) {
			focus_possible = focus_possible.concat(find_colour_focus(state, state.suits.indexOf('Rainbow'), action));
		}
		focus_possible = focus_possible.concat(find_colour_focus(state, clue.value, action));
	}
	else {
		// Pink promise assumed
		focus_possible = focus_possible.concat(find_rank_focus(state, clue.value, action));
	}

	if (state.suits.includes('Omni')) {
		focus_possible = focus_possible.concat(find_colour_focus(state, state.suits.indexOf('Omni'), action));
	}

	// Remove earlier duplicates (since save overrides play)
	return focus_possible.filter((p1, index1) => {
		return !focus_possible.some((p2, index2) => p1.suitIndex === p2.suitIndex && p1.rank === p2.rank && index1 < index2);
	});
}

module.exports = { find_focus_possible };