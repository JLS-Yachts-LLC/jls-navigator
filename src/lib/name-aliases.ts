/**
 * Common English nicknames ↔ the full first names they stand for, so a search
 * for "Mike Fetton" finds "Michael Fetton" (and "Michael" finds a "Mike").
 * Each group is interchangeable; keep entries lower-case and accent-free.
 */
const GROUPS: string[][] = [
  ['michael', 'mike', 'mick', 'mickey', 'micky', 'mikey'],
  ['william', 'will', 'bill', 'billy', 'liam', 'willy'],
  ['robert', 'rob', 'bob', 'bobby', 'robbie', 'bert'],
  ['richard', 'rick', 'ricky', 'rich', 'richie', 'dick'],
  ['james', 'jim', 'jimmy', 'jamie'],
  ['john', 'jon', 'johnny', 'jack'],
  ['jonathan', 'jon', 'jonny'],
  ['thomas', 'tom', 'tommy'],
  ['anthony', 'tony', 'antony'],
  ['christopher', 'chris', 'kit'],
  ['matthew', 'matt', 'matty'],
  ['nicholas', 'nick', 'nicky', 'nico'],
  ['alexander', 'alex', 'sasha', 'alec', 'xander'],
  ['alexandra', 'alex', 'alexa', 'sasha', 'lexi'],
  ['andrew', 'andy', 'drew'],
  ['benjamin', 'ben', 'benny'],
  ['daniel', 'dan', 'danny'],
  ['david', 'dave', 'davey'],
  ['edward', 'ed', 'eddie', 'ted', 'ned'],
  ['joseph', 'joe', 'joey'],
  ['joshua', 'josh'],
  ['peter', 'pete'],
  ['philip', 'phillip', 'phil'],
  ['samuel', 'sam', 'sammy'],
  ['samantha', 'sam', 'sammy'],
  ['stephen', 'steven', 'steve', 'stevie'],
  ['timothy', 'tim', 'timmy'],
  ['gregory', 'greg'],
  ['kenneth', 'ken', 'kenny'],
  ['lawrence', 'laurence', 'larry'],
  ['nathan', 'nathaniel', 'nate'],
  ['patrick', 'pat', 'paddy'],
  ['ronald', 'ron', 'ronnie'],
  ['donald', 'don', 'donnie'],
  ['charles', 'charlie', 'chuck', 'chaz'],
  ['frederick', 'fred', 'freddie'],
  ['henry', 'harry', 'hal'],
  ['jacob', 'jake'],
  ['zachary', 'zach', 'zack'],
  ['gerald', 'gerry', 'jerry'],
  ['raymond', 'ray'],
  ['douglas', 'doug'],
  ['geoffrey', 'jeffrey', 'geoff', 'jeff'],
  ['leonard', 'leo', 'len', 'lenny'],
  ['vincent', 'vince', 'vinny'],
  ['victor', 'vic'],
  ['oliver', 'olly', 'ollie'],
  ['elizabeth', 'liz', 'lizzie', 'beth', 'betty', 'eliza'],
  ['katherine', 'catherine', 'kathryn', 'kate', 'katie', 'kat', 'cathy', 'kathy'],
  ['margaret', 'maggie', 'meg', 'peggy'],
  ['jennifer', 'jen', 'jenny'],
  ['jessica', 'jess', 'jessie'],
  ['rebecca', 'becky', 'becca'],
  ['susan', 'sue', 'suzy'],
  ['victoria', 'vicky', 'tori'],
  ['madeleine', 'madeline', 'madison', 'maddie', 'maddy'],
  ['abigail', 'abby', 'abi'],
  ['deborah', 'debbie', 'deb'],
  ['patricia', 'pat', 'patty', 'tricia'],
  ['christina', 'christine', 'chris', 'tina', 'chrissy'],
]

const INDEX = new Map<string, Set<string>>()
for (const group of GROUPS) {
  for (const name of group) {
    const set = INDEX.get(name) ?? new Set<string>([name])
    for (const other of group) set.add(other)
    INDEX.set(name, set)
  }
}

/** The word plus every name it's a nickname for (or a nickname of). Lower-case in. */
export function nameVariants(word: string): string[] {
  const set = INDEX.get(word)
  return set ? [...set] : [word]
}
