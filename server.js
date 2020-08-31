const express = require("express");
const paypal = require("paypal-rest-sdk");
const bodyParser = require("body-parser");
const { ObjectID } = require("mongodb");
const cookie = require("cookie-parser");
const app = express();
var LocalStorage = require("node-localstorage").LocalStorage,
  localStorage = new LocalStorage("./scratch");
const MongoClient = require("mongodb").MongoClient;
const uri = process.env.DB_CONNECTION;
let client = new MongoClient(uri, { useNewUrlParser: true });

const cors = require("cors");
app.use(cors());
app.use(bodyParser.json());
app.use(cookie());
//paypal configure
paypal.configure({
  mode: "sandbox", //sandbox or live
  client_id: process.env.CLIENT_ID,
  client_secret: process.env.CLIENT_SECRET,
});

app.post("/pay", (req, res) => {
  client = new MongoClient(uri, { useNewUrlParser: true });
  client.connect((err) => {
    const collection = client.db("POWER_X_GYM").collection("Member");
    // perform actions on the collection object
    collection.insertOne(req.body, (err, result) => {
      if (err) {
        console.log(err);
      } else {
        console.log("succss insert", result.insertedId);
        client_id = result.insertedId;
        const create_payment_json = {
          intent: "sale",
          payer: {
            payment_method: "paypal",
          },
          redirect_urls: {
            return_url: `http://localhost:5000/success/${result.insertedId}/${req.body.price}`,
            cancel_url: "http://localhost:5000/cancel",
          },
          transactions: [
            {
              item_list: {
                items: [
                  {
                    name: req.body.key,
                    sku: "item",
                    price: req.body.price,
                    currency: "USD",
                    quantity: 1,
                  },
                ],
              },
              amount: {
                currency: "USD",
                total: req.body.price,
              },
              description: "This is the payment description.",
            },
          ],
        };
        paypal.payment.create(create_payment_json, function (error, payment) {
          if (error) {
            throw error;
          } else {
            for (let i = 0; i < payment.links.length; i++) {
              if (payment.links[i].rel === "approval_url") {
                res.json(payment.links[i].href);
              }
            }
          }
        });
      }
    });
    console.log("successfully connected database");
    client.close();
  });
});

app.get("/success/:client_id/:price", (req, res) => {
  const payerId = req.query.PayerID;
  const paymentId = req.query.paymentId;
  const price = req.params.price;
  const client_id = req.params.client_id;
  console.log(client_id);
  const execute_payment_json = {
    payer_id: payerId,
    transactions: [
      {
        amount: {
          currency: "USD",
          total: price,
        },
      },
    ],
  };
  paypal.payment.execute(paymentId, execute_payment_json, function (
    error,
    payment
  ) {
    if (error) {
      console.log(error.response, 1);
      throw error;
    } else {
      console.log(JSON.stringify(payment));
      console.log(client_id);
      client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      client.connect((err) => {
        const collection = client.db("POWER_X_GYM").collection("Member");
        // console.log('Succesfuly inserted',result)
        collection.updateOne(
          { _id: ObjectID(client_id) },
          { $set: { payment: true, payerId: payerId, paymentId: paymentId } },
          { upsert: true },
          (err, result) => {
            if (err) {
              console.log(err, 1);
              res.status(500).send({ message: err });
            } else {
              console.log("successfull updated");
              res.cookie("gym", "true");
              res.redirect(
                `http://localhost:3000/complete/${client_id}/${paymentId}`
              );
            }
            client.close();
          }
        );
      });
    }
  });
});

//databse

app.get("/database", (req, res) => {});
const port = process.env.PORT || 5000;
app.listen(port, () => console.log("server is on 5000"));
