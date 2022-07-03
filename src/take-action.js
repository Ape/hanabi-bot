const { ACTION, find_playables, find_known_trash } = require('./action-helper.js');
const { find_clues, find_tempo_clues, find_stall_clue } = require('./clue-finder.js');
const { find_chop } = require('./hanabi-logic.js');
const Utils = require('./util.js');

function take_action(state, tableID) {
	const hand = state.hands[state.ourPlayerIndex];
	const { play_clues, save_clues } = find_clues(state);

	// First, check if anyone needs an urgent save
	// TODO: Check if players have something safe to do (playable or trash)
	// TODO: Check if someone else can save
	// TODO: scream discard?
	if (state.clue_tokens > 0) {
		for (let i = 1; i < state.numPlayers; i++) {
			const target = (state.ourPlayerIndex + i) % state.numPlayers;

			// They require a save clue and cannot be given a play clue
			if (save_clues[target] !== undefined && find_playables(state.play_stacks, state.hands[target]).length === 0 && play_clues[target].length === 0) {
				const { type, value } = save_clues[target];
				Utils.sendCmd('action', { tableID, type, target, value });
				return;
			}
		}

		// Then, check if anyone needs a save that can be distracted by a play
		// TODO: Check if someone else can save
		for (let i = 1; i < state.numPlayers; i++) {
			const target = (state.ourPlayerIndex + i) % state.numPlayers;

			// They require a save clue and can be given a play clue
			if (save_clues[target] !== undefined && find_playables(state.play_stacks, state.hands[target]).length === 0 && play_clues[target].length > 0) {
				const { type, value } = play_clues[target][0];
				Utils.sendCmd('action', { tableID, type, target, value });
				return;
			}
		}
	}

	// Then, look for playables or trash in own hand
	let playable_cards = find_own_playables(state.play_stacks, hand);
	const trash_cards = find_known_trash(state.play_stacks, hand);

	// Determine if any cards are clued duplicates, and if so, perform a sarcastic discard
	for (const card of hand) {
		if (!card.clued) {
			continue;
		}
		let all_duplicates = true;
		// Playable card from inference or from known
		const possibilities = (card.inferred.length !== 0) ? card.inferred : card.possible;
		for (const possible of possibilities) {
			// Find all duplicates, excluding itself
			const duplicates = Utils.visibleFind(state, state.ourPlayerIndex, possible.suitIndex, possible.rank).filter(c => c.order !== card.order);
			console.log('checking for duplicate of', Utils.cardToString(possible), '- duplicates', duplicates.map(c => c.clued));

			// No duplicates or none of duplicates are clued
			if (duplicates.length === 0 || !duplicates.some(c => c.clued)) {
				all_duplicates = false;
				break;
			}
		}

		if (all_duplicates) {
			console.log('found duplicate card');
			trash_cards.unshift(card);
			playable_cards = playable_cards.filter(c => c.order !== card.order);
			break;
		}
	}
	console.log('playable cards', Utils.logHand(playable_cards));

	// No saves needed, so play
	if (playable_cards.length > 0) {
		// TODO: Play order (connecting card in other hand, 5, connecting card in own hand, lowest card)
		Utils.sendCmd('action', { tableID, type: ACTION.PLAY, target: playable_cards[0].order });
	}
	else {
		if (state.clue_tokens > 0) {
			for (let i = 1; i < state.numPlayers; i++) {
				const target = (state.ourPlayerIndex + i) % state.numPlayers;

				if (play_clues[target].length > 0) {
					const { type, value } = play_clues[target][0];
					Utils.sendCmd('action', { tableID, type, target, value });
					return;
				}
			}

			// In 2 player, all tempo clues become valuable
			if (state.numPlayers === 2) {
				const otherPlayerIndex = (state.ourPlayerIndex + 1) % 2;
				const tempo_clues = find_tempo_clues(state);

				if (tempo_clues[otherPlayerIndex].length > 0) {
					const { type, value } = tempo_clues[otherPlayerIndex][0];
					Utils.sendCmd('action', { tableID, type, target: otherPlayerIndex, value });
					return;
				}
			}
		}

		// 8 clues
		if (state.clue_tokens === 8) {
			const { type, value, target } = find_stall_clue(state, 4);

			// Should always be able to find a clue, even if it's a hard burn
			Utils.sendCmd('action', { tableID, type, target, value });
			return;
		}

		// Locked hand and no good clues to give
		if (state.hands[state.ourPlayerIndex].every(c => c.clued)) {
			// Discard if possible
			if (trash_cards.length > 0) {
				Utils.sendCmd('action', { tableID, type: ACTION.DISCARD, target: trash_cards[0].order });
				return;
			}

			// Give stall clue if possible
			if (state.clue_tokens > 0) {
				const { type, value, target } = find_stall_clue(state, 3);
				Utils.sendCmd('action', { tableID, type, target, value });
				return;
			}
		}

		// Nothing else to do, so discard
		const chopIndex = find_chop(hand);
		let discard;

		if (trash_cards.length > 0) {
			discard = trash_cards[0];
		}
		else if (chopIndex !== -1) {
			discard = hand[chopIndex];
		}
		else {
			discard = hand[Math.floor(Math.random() * hand.length)];
		}
		console.log('trash cards', Utils.logHand(trash_cards), 'chop index', chopIndex);

		Utils.sendCmd('action', { tableID, type: ACTION.DISCARD, target: discard.order });
	}
}

module.exports = { take_action };
