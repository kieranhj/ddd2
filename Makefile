.POSIX:
# Makefile - Dare Devil Denis on any POSIX make. build.ps1 is the same build for Windows.
#
#   make            assemble build/ddd.ssd
#   make compare    and check it against reference/sth/DareDevilDenis.ssd (skipped if absent)
#   make clean
#
#   PYTHON=python3  BARON=baron

PYTHON ?= python3
BARON  ?= baron

SRC = src/main.6502 src/os.6502 src/zp.6502 src/game.6502 src/denis2.6502

all: build/ddd.ssd

build/ddd.ssd: $(SRC)
	mkdir -p build
	$(BARON) --warn 2 -o build/ddd.ssd --title DAREDEVILDEN --opt 3 \
		--symbols build/ddd.symbols.json -v src/main.6502 > build/ddd.lst || \
		{ rm -f build/ddd.ssd build/ddd.symbols.json; exit 1; }

compare: build/ddd.ssd
	$(PYTHON) tools/compare.py build/ddd.ssd

clean:
	rm -rf build

.PHONY: all compare clean
