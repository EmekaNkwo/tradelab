/**
 * Broker check steps (spec §20, lesson fx-broker-check). Generic steps only:
 * no firm, register address or licence is named, and the app checks nothing
 * itself.
 */
export interface BrokerCheckStep {
  readonly id: string;
  readonly text: string;
}

export const BROKER_CHECK_STEPS: readonly BrokerCheckStep[] = [
  { id: 'found_myself', text: 'I found the regulator’s official website myself, not through a link from the broker, an advert or a chat.' },
  { id: 'name_listed', text: 'The firm’s exact name is on the regulator’s register.' },
  { id: 'website_matches', text: 'The website address on the register is the one I am using.' },
  { id: 'contacts_match', text: 'The phone number, email and address match the register.' },
  { id: 'not_warned', text: 'If the regulator publishes a warning list, the firm is not on it.' },
  { id: 'local_rules', text: 'I checked the rules for traders where I live.' },
  { id: 'no_pressure', text: 'Nobody promised returns, asked for remote access to my phone, or pushed me to deposit quickly.' },
];

export const BROKER_CHECK_REMINDER =
  'This list helps you check; it does not confirm any firm, and the app does not check brokers. Even a properly regulated broker does not make trading safe or profitable.';
