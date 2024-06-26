import { clue_safe } from './clue-safe.js';
import { determine_focus } from '../hanabi-logic.js';
import { bad_touch_result, elim_result, playables_result } from '../../../basics/clue-result.js';
import { cardValue, isTrash } from '../../../basics/hanabi-util.js';
import { find_clue_value } from '../action-helper.js';

import logger from '../../../tools/logger.js';
import { logCard, logClue } from '../../../tools/log.js';
import * as Utils from '../../../tools/util.js';
import { direct_clues } from '../../../variants.js';

/**
 * @typedef {import('../../h-group.js').default} Game
 * @typedef {import('../../../basics/Card.js').Card} Card
 * @typedef {import('../../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../../types.js').Clue} Clue
 * @typedef {import('../../../types.js').ClueAction} ClueAction
 * @typedef {import('../../../types.js').ClueResult} ClueResult
 *
 * @typedef {{ excludeColour: boolean, excludeRank: boolean, save: boolean }} ClueOptions
 */

/**
 * Evaluates the result of a clue. Returns the hypothetical state after the clue if correct, otherwise undefined.
 * @param  {Game} game
 * @param  {ClueAction} action
 * @param  {Clue} clue
 * @param  {number} target
 * @param  {ActualCard} target_card
 * @param  {ActualCard[]} bad_touch_cards
 */
export function evaluate_clue(game, action, clue, target, target_card, bad_touch_cards) {
	const { state } = game;

	// Prevent outputting logs until we know that the result is correct
	logger.collect();

	logger.highlight('green', `------- ENTERING HYPO ${logClue(clue)} --------`);

	const hypo_game = game.simulate_clue(action, { enableLogs: true });

	logger.highlight('green', '------- EXITING HYPO --------');

	const incorrect_card = state.hands[target].find(c => {
		const card = hypo_game.common.thoughts[c.order];
		const visible_card = hypo_game.me.thoughts[c.order];

		// The focused card must not have been reset and must match inferences
		if (c.order === target_card.order)
			return card.reset || !card.matches_inferences();

		const old_card = game.common.thoughts[c.order];

		// For non-focused cards:
		return !((!card.reset && (card.identity() === undefined || card.possible.length === 1 || card.matches(visible_card))) || 											// Matches inferences
			old_card.reset || !old_card.matches_inferences() || old_card.inferred.length === 0 ||		// Didn't match inference even before clue
			card.chop_moved ||																			// Chop moved (might have become trash)
			(c.clued && isTrash(state, game.me, visible_card)) ||		// Previously-clued duplicate or recently became basic trash
			bad_touch_cards.some(b => b.order === c.order) ||										// Bad touched
			card.possible.every(id => isTrash(hypo_game.state, hypo_game.common, id, c.order)));	// Known trash
	});

	// Print out logs if the result is correct
	logger.flush(incorrect_card === undefined);

	if (incorrect_card) {
		let reason = '';

		const card = hypo_game.common.thoughts[incorrect_card.order];
		if (card.reset) {
			reason = `card ${logCard(card)} ${card.order} lost all inferences and was reset`;
		}
		else if (!card.matches_inferences()) {
			reason = `card ${logCard(card)} has inferences [${card.inferred.map(logCard).join(',')}], doesn't match`;
		}
		else {
			const not_trash_possibility = card.possible.find(c => !isTrash(hypo_game.state, hypo_game.common, c, card.order));
			if (not_trash_possibility !== undefined)
				reason = `card ${logCard(card)} has ${not_trash_possibility} possibility not trash`;
		}
		logger.info(`${logClue(clue)} has incorrect interpretation, (${reason})`);
		return undefined;
	}

	return hypo_game;
}

/**
 * Returns some statistics about the clue.
 * @param  {Game} game
 * @param  {Game} hypo_game
 * @param  {Clue} clue
 * @param  {number} giver
 * @param  {{touch?: ActualCard[], list?: number[]}} provisions 	Provided 'touch' and 'list' variables if clued in our hand.
 */
export function get_result(game, hypo_game, clue, giver, provisions = {}) {
	const { common, state } = game;
	const { common: hypo_common, state: hypo_state } = hypo_game;

	const { target } = clue;
	const hand = state.hands[target];

	const touch = provisions.touch ?? hand.clueTouched(clue, state.variant);
	const list = provisions.list ?? touch.map(c => c.order);

	const { focused_card } = determine_focus(hand, common, list, { beforeClue: true });

	const { new_touched, fill } = elim_result(common, hypo_common, hand, list);
	const { bad_touch, trash } = bad_touch_result(hypo_game, hypo_common, target, focused_card.order);
	const { finesses, playables } = playables_result(hypo_state, common, hypo_common);

	const new_chop = hypo_game.common.chop(hand, { afterClue: true });
	const remainder = (new_chop !== undefined) ? cardValue(hypo_state, hypo_game.me, game.me.thoughts[new_chop.order], new_chop.order) :
						hypo_common.thinksTrash(hypo_state, target).length > 0 ? 0 : 4;

	return { elim: fill, new_touched, bad_touch, trash, finesses, playables, remainder };
}

/**
 * Returns the best clue to focus the target card.
 * @param {Game} game
 * @param {number} target 					The player index with the card.
 * @param {ActualCard} target_card 			The card to be focused.
 * @param {Partial<ClueOptions>} [options] 	Any additional options when determining clues.
 * @returns {Clue | undefined}				The best clue (if valid).
 */
export function determine_clue(game, target, target_card, options) {
	const { common, state } = game;

	logger.info('determining clue to target card', logCard(target_card));
	const hand = state.hands[target];

	const possible_clues = direct_clues(state.variant, target, target_card, options);

	/** @type {{ clue: Clue, result: ClueResult}[]} */
	const results = [];

	for (const clue of possible_clues) {
		const touch = hand.clueTouched(clue, state.variant);
		const list = touch.map(c => c.order);

		const { focused_card, chop } = determine_focus(hand, common, list, { beforeClue: true });
		if (focused_card.order !== target_card.order) {
			logger.info(`${logClue(clue)} focuses ${logCard(focused_card)} instead of ${logCard(target_card)}, ignoring`);
			continue;
		}

		// All play clues should be safe, but save clues may not be (e.g. crit 4, 5 of different colour needs to identify that 5 is a valid clue)
		if (!options.save && !clue_safe(game, game.me, clue)) {
			logger.info(`${logClue(clue)} is an unsafe play clue, ignoring`);
			continue;
		}

		const bad_touch_cards = touch.filter(c => !c.clued && isTrash(state, game.me, game.me.thoughts[c.order].identity({ infer: true }), c.order));		// Ignore cards that were already clued

		// Simulate clue from receiver's POV to see if they have the right interpretation
		const action =  /** @type {const} */ ({ type: 'clue', giver: state.ourPlayerIndex, target, list, clue });
		const hypo_game = evaluate_clue(game, action, clue, target, target_card, bad_touch_cards);

		// Clue had incorrect interpretation
		if (hypo_game === undefined)
			continue;

		const interpret = hypo_game.common.thoughts[target_card.order].inferred;
		const result = get_result(game, hypo_game, clue, state.ourPlayerIndex);

		const { elim, new_touched, bad_touch, trash, finesses, playables } = result;
		const remainder = (chop && (!clue_safe(game, game.me, clue) || state.clue_tokens <= 2)) ? result.remainder: 0;

		const result_log = {
			clue: logClue(clue),
			bad_touch,
			trash,
			interpret: interpret?.map(logCard),
			elim,
			new_touched,
			finesses: finesses.length,
			playables: playables.map(({ playerIndex, card }) => {
				return { player: state.playerNames[playerIndex], card: logCard(card) };
			}),
			remainder	// We only need to check remainder if this clue focuses chop, because we are changing chop to something else
		};
		logger.info('result,', JSON.stringify(result_log), find_clue_value(Object.assign(result, { remainder })));

		results.push({ clue, result: { elim, new_touched, bad_touch, trash, finesses, playables, remainder } });
	}

	if (results.length === 0)
		return;

	const { clue, result: best_result } = Utils.maxOn(results, ({ result }) => find_clue_value(result));
	logger.info('preferring', logClue(clue));

	// Change type from CLUE to ACTION
	return { type: clue.type, value: clue.value, target: clue.target, result: best_result };
}
