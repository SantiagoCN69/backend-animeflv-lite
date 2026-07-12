import { get } from "https";
import { writeFileSync } from "fs";

const url = "https://animeav1.com/media/kabushikigaisha-magi-lumiere-2nd-season";

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