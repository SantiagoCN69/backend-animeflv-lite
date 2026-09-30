import { get } from "https";
import { writeFileSync } from "fs";

const url = "https://animeav1.com/horario";

get(url, (res) => {
  let html = "";

  res.on("data", (chunk) => {
    html += chunk;
  });

  res.on("end", () => {
    writeFileSync("prueba.html", html, "utf8");
    console.log("HTML guardado como prueba.html");
  });

}).on("error", (err) => {
  console.error("Error:", err.message);
});