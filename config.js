// Everything you'd want to tweak without touching app.js.
export const CONFIG = {
  title: 'Heartstrings',

  // Where the data comes from. To read straight from Google Sheets:
  // File → Share → Publish to web → pick the "People" tab → CSV → copy the link
  // and paste it here (then do the same for "Links").
  peopleCsv: 'data/people.csv?v=1794564273',
  linksCsv: 'data/links.csv?v=1794564273',

  // Folder that artifact_image filenames are looked up in.
  artifactsPath: 'artifacts/',

  centerName: 'me',

  // Words swapped out of the notes on the cards because they say too much about who someone is.
  redact: { Penn: 'school' },

  // How roomy the 3D layout looks (1 = original, bigger = more space between people).
  // Only affects the website; the build sheet's real measurements stay the same.
  spread: 1.5,

  // People shown as their symbol instead of their name (labels, panels, notes).
  // Keys = the name exactly as in the spreadsheet; values = file in symbolsPath.
  // Make/refresh the files with: python3 -I make_symbols.py
  symbolsPath: 'symbols/',
  symbols: {
    me: 'zara.svg', Zara: 'zara.svg', P01: 's01.svg', P02: 's02.svg', P03: 's03.svg', P04: 's04.svg',
    P05: 's05.svg', P06: 's06.svg', P07: 's07.svg', P08: 's08.svg', P09: 's09.svg', P10: 's10.svg',
    P11: 's11.svg', P12: 's12.svg', P13: 's13.svg', P14: 's14.svg', P15: 's15.svg', P16: 's16.svg',
    P17: 's17.svg', P18: 's18.svg', P19: 's19.svg', P20: 's20.svg', P21: 's21.svg', P22: 's22.svg',
    P23: 's23.svg', P24: 's24.svg', P25: 's25.svg', P26: 's26.svg', P27: 's27.svg', P28: 's28.svg',
    P29: 's29.svg', P30: 's30.svg', P31: 's31.svg', P32: 's32.svg', P33: 's33.svg',
  },

  // String colors per group (keep it to 3–4). Group names must match the spreadsheet.
  groups: {
    home: '#ff5fa2',     // bubblegum pink
    college: '#8b6cff',  // lavender violet
    other: '#1fc4b0',    // mint
  },

  // Thread names for the build sheet's strand recipes (embroidery floss colors).
  threads: {
    home: 'red',
    college: 'ochre',
    other: 'blue',
    friends: 'ecru',   // strings between two friends
    faded: 'gray',
    ended: 'black',
  },

  background: '#fbf5ff',

  // How far up/down people hang from "me" (in model units; the outer ring is ~275).
  liftRange: 40,

  // Physical installation, used by the build sheet.
  install: {
    outerRadiusCm: 90,  // how far the farthest friends hang from "me"; scales the whole piece
    meDropCm: 120,      // how far "me" hangs below the ceiling
    slack: 0.1,         // extra string length for knots and sag (10%)
  },
};
