# GNU make reads this file before Makefile.
# On Windows (no sh on PATH; GNU make runs recipes with cmd.exe) the POSIX
# Makefile cannot run, so `make` calls build.ps1, the same build for Windows.
# Everywhere else this just includes the POSIX Makefile unchanged.
ifeq ($(OS),Windows_NT)
PS := pwsh -NoProfile -ExecutionPolicy Bypass -File build.ps1

.PHONY: all build nocompare sequel help
all: build sequel

build:
	$(PS)

nocompare:
	$(PS) -NoCompare

# The sequel takes its sprites from build\ddd.ssd, so the original builds first.
sequel: build
	pwsh -NoProfile -ExecutionPolicy Bypass -File sequel\build.ps1

help:
	@echo make            - the original (build\ddd.ssd, compared with the reference disc) then the sequel
	@echo make build      - the original only (build.ps1)
	@echo make nocompare  - the original, assemble only (build.ps1 -NoCompare)
	@echo make sequel     - the four-player sequel, sequel\build\ddd2.ssd (sequel\build.ps1)
	@echo make help       - this list
	@echo To build and launch b2: .\build.ps1 -Run  or  .\sequel\build.ps1 -Run
else
include Makefile
endif
