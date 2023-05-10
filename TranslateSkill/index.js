var http = require('https');
const searchUrl = process.env.SearchUrl;
const searchKey = process.env.SearchKey;
const translatorKey = process.env.TranslatorKey;
const translatorRegion = process.env.TranslatorRegion;
const translatorUrl = process.env.TranslatorUrl;

const searchOptions = {
  method: 'POST',
  headers: {
    'api-key': searchKey,
    'Content-Type': 'application/json'
  }
};
const translatorOptions = {
  method: 'POST',
  headers: {
    'Ocp-Apim-Subscription-Key': translatorKey,
    'Ocp-Apim-Subscription-Region': translatorRegion,
    'Content-Type': 'application/json'
  }
};

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    let response = '';
    const request = http.request(url, options, (res) => {
      res.on('data', (d) => {
        response += d;
      })

      res.on('end', (d) => {
        try {
          resolve(JSON.parse(response));
        } catch (error) {
          reject(error);
        }
      })
    })

    request.on('error', (error) => {
      reject(error);
    })

    request.write(JSON.stringify(body));
    request.end();
  });
}

function search(id) {
  return httpRequest(searchUrl, searchOptions, {
    search: id,
    searchFields: "id"
  });
};

function translate(text) {
  return httpRequest(translatorUrl, translatorOptions, [{
    text: text
  }]);
};

module.exports = async function (context, req) {
  context.log('Custom skill - translator');

  let data = req.body && req.body.values;
  
  if (!data) {
    context.log('Invalid input');

    context.res = {
      status: 400,
      body: "Please pass a valid request body"
    };

    return;
  }

  let response = {
    "values": []
  };

  context.log(`Processing ${data.length} records`);

  for (let i = 0; i < data.length; i++) {
    let record = data[i];

    context.log(record);

    if (!record || !record.recordId || !record.data || !record.data.id || !record.data.name) {
      context.log(`Record ${i} has invalid format`);
      return;
    }

    let output = {
      recordId: record.recordId,
      data: {},
      errors: [],
      warnings: []
    };

    try {
      context.log('Searching for record in index');
      const found = await search(record.data.id);

      let isValid = (current, last) => {
        let currentDate = new Date(current);
        let lastDate = new Date(last);

        return (currentDate.valueOf() - lastDate.valueOf()) < (24 * 60 * 60 * 1000);
      };

      let isSame = (current, last) => {
        return isNaN(current) && isNaN(last) || current === last;
      };

      let needsTranslation = (stored) => {
        return stored.value.length === 0 ||
          !isValid(record.data.last_modified, stored.value[0].metadata_spo_item_last_modified) ||
          !isSame(record.data.size, stored.value[0].metadata_spo_item_size)
      };

      if (!found || found.error || !found.value) {
        context.log('Search failed',found?.error);
        output.errors.push(found?.error || 'Search failed'); 
      } else if (needsTranslation(found)) {
        context.log('Record not found in index or not up-to-date, translating');

        const translations = await translate(record.data.name);

        if (!translations || 
          translations.error || 
          translations.length === 0 || 
          !translations[0].translations || 
          translations[0].translations[0].length === 0) {

          context.log('Translation failed', translations?.error);
          output.errors.push(translations?.error || 'Translation failed'); 
        } else {
          context.log('Returning translation');
          output.data.translated_name = translations[0].translations[0].text;
        }
      } else {
        context.log('Record is valid, using previous translation');
        output.data['translated_name'] = found.value[0].translated_name;
      }

      response.values.push(output);
    } catch (error) {
      context.log.error(`Error processing record ${record.recordId}`, error);
      output.errors.push(error);
    }
  };

  context.log('Records processed, returning response');

  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: response
  };
}