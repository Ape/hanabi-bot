/**
 * @typedef {import('./basics/Card.js').Card} Card
 * @typedef {import('./basics/Card.js').ActualCard} ActualCard
 * @typedef {typeof import('./constants.js').CLUE} CLUE
 * @typedef {typeof import('./constants.js').ACTION} ACTION
 */

/**
 * @typedef Identity
 * @property {number} suitIndex
 * @property {number} rank
 */
/**
 * @typedef BaseClue
 * @property {CLUE[keyof CLUE]} type
 * @property {number} value
 * 
 * @typedef {BaseClue & {target: number, result?: ClueResult}} Clue
 * @typedef {Clue & {playable: boolean, cm: ActualCard[], safe: boolean}} SaveClue
 * @typedef {Clue & {urgent: boolean, trash: boolean}} FixClue
 */
/**
 * @typedef ClueResult
 * @property {number} elim
 * @property {number} new_touched
 * @property {number} bad_touch
 * @property {number} trash
 * @property {number} remainder
 * @property {{playerIndex: number, card: Card}[]} playables
 * @property {{playerIndex: number, card: Card}[]} finesses
 */
/**
 * @typedef StatusAction
 * @property {'status'} type
 * @property {number}   clues
 * @property {number}   score
 * @property {number}   maxScore
 * 
 * @typedef TurnAction
 * @property {'turn'}   type
 * @property {number}   num
 * @property {number}   currentPlayerIndex
 * 
 * @typedef ClueAction
 * @property {'clue'}   type
 * @property {number} 	giver
 * @property {number} 	target
 * @property {number[]} list
 * @property {BaseClue} clue
 * @property {boolean}  [mistake]
 * @property {boolean}  [ignoreStall]
 * @property {boolean}	[lock]
 * 
 * @typedef CardAction
 * @property {number} order
 * @property {number} playerIndex
 * @property {number} suitIndex
 * @property {number} rank
 * 
 * @typedef {CardAction & {type: 'draw'}} DrawAction
 * @typedef {CardAction & {type: 'play'}} PlayAction
 * @typedef {CardAction & {type: 'identify', infer?: boolean}} IdentifyAction
 * @typedef {{type: 'ignore', conn_index: number, order: number}} IgnoreAction
 * @typedef {{type: 'finesse', list: number[], clue: BaseClue}} FinesseAction
 * @typedef {CardAction & {type: 'discard', failed: boolean}} DiscardAction
 * 
 * @typedef GameOverAction
 * @property {'gameOver'}   type
 * @property {number}       endCondition
 * @property {number}       playerIndex
 * @property {any}          votes
 * 
 * @typedef {StatusAction | TurnAction | ClueAction | DrawAction | DiscardAction | PlayAction | GameOverAction | IdentifyAction | IgnoreAction | FinesseAction} Action
 */
/**
 * @typedef PerformAction
 * @property {number} tableID
 * @property {ACTION[keyof ACTION]} type
 * @property {number} target
 * @property {number} [value]
 */
/**
 * @typedef Connection
 * @property {'known' | 'playable' | 'prompt' | 'finesse' | 'terminate'} type
 * @property {number} reacting
 * @property {ActualCard} card
 * @property {Identity[]} identities
 * @property {boolean} [self]
 * @property {boolean} [hidden]
 * @property {ActualCard[]} [linked]
 * @property {boolean} [certain]
 * @property {boolean} [ambiguous]
 * 
 * @typedef FocusPossibility
 * @property {number} suitIndex
 * @property {number} rank
 * @property {Connection[]} connections
 * @property {boolean} [save]
 *
 * @typedef {FocusPossibility & {fake: boolean}} SymFocusPossibility
 */
/**
 * @typedef WaitingConnection
 * @property {Connection[]} connections
 * @property {number} giver
 * @property {number} target
 * @property {number} conn_index
 * @property {ActualCard} focused_card
 * @property {{suitIndex: number, rank: number}} inference
 * @property {number} action_index
 * @property {boolean} [ambiguousPassback]
 * @property {boolean} [fake]
 * @property {boolean} [symmetric]
 */
/**
 * @typedef Link
 * @property {ActualCard[]} cards
 * @property {Identity[]} identities
 * @property {boolean} promised
 */

export {};
