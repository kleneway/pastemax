# Known Issues

## Performance Issues
- Load times for really large repos are really slow.
- Large repos cause UI to be slow.

## .gitignore Handling
- Really deep and large repo cause the program to not properly read the .gitignore and do proper ignores.
- Really deep ignore causes default binary ignore and default ignores such as bin and nodemodules are not properly considered.
- Should add flag of 'has binaries' for folders that has binary files.

## Proposed Improvements
- improve chunk loading further to be more optimised.
- introduce caching to ensure loaded folder handling is fast and optimised.
- Ignores should be done before loading and should be saved in the duration of running.
- This way when reloading it wouldn't look for the ignores again.
- Binary exception should be done only after ignores are checked.
- Should add a way in which if selected folder has multiple gitignores, it would collect all of the gitignores and combine them (ensuring only unique entries) and then make into one big ignore in which the program should use during the duration of running.
