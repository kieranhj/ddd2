# Done

What has landed, with the number that says it landed. `PLAN.md` is what is left. Newest first.

---

## The sequel's brief, and the software-scroll spike (2026-11-07)

The owner's brief: a four-player endless runner, one strip of the original each, with the course
made of the original's levels end to end. It is recorded as decisions 4-10, with the design in
`docs/sequel.md`. The rebuild was pushed to github.com/kieranhj/ddd2 with its tag.

**Spike** (MEASURED, jsbeeb `B-DFS1.2`, `spikes/swscroll/`, `docs/spike-swscroll.md`). Four MODE 2
strips scrolled in software at independent speeds on a Model B.
- **Rate:** 100 loop passes in 100 fields, both at mixed speeds and with all four at the
  original's top speed of 2.93 columns.
- **Cost:** 25,158-27,328 cycles a field at the worst case, before any optimisation.

---

## Step 1 - the original rebuilt byte for byte (2026-11-07)

**Specification proved** (MEASURED, `tools/check_disasm.py`). Level7's disassembly
(`reference/dare-devil-denis-disassembly.txt`, SHA256 `ae26b2c9...788d`) is of the tape release
(DDDenis1-3). Against the STH disc (`reference/sth/DareDevilDenis.ssd`, SHA256
`44634388...2a15`; files `DENIS3`, `DENIS2`, `DENIS`, `!BOOT`, `LOAD`):

| Tape section | Disc file | Result |
|---|---|---|
| DDDenis3 (&0E00, game) | DENIS3, 9,872 bytes | all 9,872 bytes identical (the disassembly's `&2edf    04 05 ...` line has extra spaces after the address; the first check regex missed it) |
| DDDenis2 (&4000) | DENIS2, 2,816 bytes | identical from &40E9; &4002-&40E8 differ - the disc release's own BASIC, which loads DENIS3 at &1100 and copies it to &0E00 instead of the tape's `*RUN`, and drops the tape's `*FX247-249` BREAK intercept |
| DDDenis1 (tape BASIC loader) | none | the disc's `DENIS` is a shorter program: envelopes, `VDU 23,250`, `PAGE=&4000`, `CHAIN"DENIS2"` |

**Converted** (`tools/disasm2baron.py`, forked from Stryker's Run's): 386 labels, 1,080 absolute and
297 zero-page operands symbolic, 45 immediates as `LO()`/`HI()`, 11 names defined inside
instructions, 42 zero-page names and 24 workspace constants (`src/zp.6502`). One correction: the
disassembly's last line (`&4aff ad LDA &....`) is cut off by the end of the file - one byte, `&AD`.
Two lines in unused copies of code are partial instructions and stay as `EQUB`.

**Rebuilt** (MEASURED, `tools/compare.py`, Baron 0.6.0): all five files identical in bytes, load
and exec address (all 18 bits) and start sector; title `DAREDEVILDEN`, boot option 3, 800 sectors.
Whole image: 82 bytes differ, none in a file - the catalogue's write-cycle byte (&11 vs 0) and 81
bytes of slack past file ends (&34B1-&34FF after DENIS, &370E-&370F after LOAD) (decision 3).
`build.ps1` and `make` produce the same image (`cmp`). Built image SHA256 `dea7f485...e63b`.

**Smoke test** (jsbeeb MCP, B-DFS1.2, 2026-11-07): boots through !BOOT, LOAD, DENIS, the Visions
loading screen (SPACE past `INKEY(3000)`), the title page, the skill screen ("Highest wages paid
today £0"); A starts the game: MODE 2, WAGES 000000, four ground rows, house, ambulance moving,
tree, spider.
