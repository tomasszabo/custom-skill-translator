# Custom skill - translator

Implementation of custom skill for Azure Search which:

1. Checks Azure Search index for given document.
2. If document does not exists, or is outdated, calls Azure Translator to update the translation of corresponding document and returns it.
3. Otherwise return translation already stored in index. 

# License

Published under [MIT](LICENSE) license.