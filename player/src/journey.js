const db = require('db');

const tableName = process.env.TABLE_NAME;
const { createResponse } = require('utils');

exports.get = (event, context, callback) => {
    if (event.pathParameters && event.pathParameters.journeyid)
        return db.get_item(event.pathParameters.journeyid, db.sortkey.journey);

    return db.simple_scan(db.sortField, db.sortkey.journey);
}

exports.compile = (event) => {
    const reqBody = JSON.parse(event.body);

    let params = {
        RequestItems: {
            [tableName]: {
                Keys: reqBody.journeys.map(x => {
                    return {id: x, sort: db.sortkey.journey }
                })
            }
        }
    };

    const transitionPromise = () => {
        let tparams = {
            TableName: tableName,
            Key: {
                id: "TRANSITION",
                sort: db.sortkey.content
            },
            ProjectionExpression: "content"
        };
        return db.dynamo.get(tparams).promise()
    }

    const prependItems = (page, prefix) => {
        return [{'title': 'Transition', 'items': page.Item.content.items}];
    }
    return Promise.all([db.dynamo.batchGet(params).promise(),transitionPromise()])
    .then( ([data,transitionPage]) => {
        const journeys = data.Responses[tableName]

        let titles = new Set()

        let pages = journeys.map(jny => {
            const pages = jny.doc.pages.filter(x => {
                if (titles.has(x))
                    return false

                titles.add(x)
                return true
            })
            
            pages.forEach(page => page.journey = jny.label)
            return pages
        }).filter(x => x.length > 0).flat()
        
        if (transitionPage.Item)
            pages = pages.join(prependItems(transitionPage))
        
        return createResponse(200, JSON.stringify({pages}));
    }).catch( (err) => { 
        console.log(`journey.compile error: ${JSON.stringify(err)}`);
        return createResponse(500);
    });
}
