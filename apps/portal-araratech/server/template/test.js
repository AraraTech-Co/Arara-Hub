
import chai from "chai";
import chaiHttp from "chai-http";
import server from "../src/testServer";
import config from "./config";
const should = chai.should();

chai.use(chaiHttp);

// create a new api key
describe("POST /{{view}}", () => {
  it("should create a new {{view}}", (done) => {
    chai
      .request(server)
      .post("/api/{{view}}")
      .set(config.auth, process.env.token as string)
      .send(config.mock)
      .end((err, res) => {
        const {{view}} = res.body;
        res.should.have.status(200);
        process.env.{{view}}_id = {{view}}.id;
        done();
      });
  }).timeout(config.timeout);
});

// use the API key
describe("GET /{{view}}/:id", () => {
  it("should get {{view}} by id", (done) => {
    chai
      .request(server)
      .get("/api/{{view}}/:id")
      .set(config.auth, process.env.token as string)
      .end((err, res) => {
        res.should.have.status(200);
        done();
      });
  }).timeout(config.timeout);
});

// get a list of API keys
describe("GET /{{view}}", () => {
  it("should list {{view}}", (done) => {
    chai
      .request(server)
      .get("/api/{{view}}")
      .set(config.auth, process.env.token as string)
      .end((err, res) => {
        res.should.have.status(200);
        done();
      });
  }).timeout(config.timeout);
});

// delete an api key
describe("DELETE /{{view}}/:id", () => {
  it("should delete an API key", (done) => {
    chai
      .request(server)
      .delete("/api/{{view}}/" + process.env.{{view}}_id)
      .set(config.auth, process.env.token as string)
      .end((err, res) => {
        res.should.have.status(200);
        done();
      });
  }).timeout(config.timeout);
});
