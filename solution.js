import http from "node:http";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import url from "node:url";
import path from "node:path";
import readline from "node:readline";

// Константы
const BACKUP_FILE_PATH = process.env.BACKUP_FILE_PATH || "./testDB.txt";
const PORT = process.env.PORT || 3000;
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGES_DIR = path.join(__dirname, "images");

let filmsData = [];

// Функция для создания директории для изображений
const createImagesDir = async () => {
  await fsPromises.mkdir(IMAGES_DIR, { recursive: true });
};

// Функция для чтения данных о фильмах и сохранения изображений
const dataReader = async () => {
  let filmsData = [];

  const lineReader = readline.createInterface({
    input: fs.createReadStream(BACKUP_FILE_PATH),
    crlfDelay: Infinity,
  });

  for await (const line of lineReader) {
    try {
      const movie = JSON.parse(line.trim());
      const imagePath = path.join(IMAGES_DIR, `${movie.id}.jpeg`);

      // Убираем из movie все лишние поля, кроме тех, что указаны в IFilmCard
      const { id, title, description, genre, release_year } = movie;
      filmsData.push({
        id,
        title,
        description,
        genre,
        release_year,
      });

      const imgBuffer = Buffer.from(movie.img, "base64");
      await fsPromises.writeFile(imagePath, imgBuffer);
    } catch (error) {
      console.error("Error processing film line:", error);
    }
  }

  return filmsData;
};

// Функция для обработки запроса на получение изображения
const handleGetImage = async (req, res) => {
  const movieId = req.url.split("/").pop();
  const imagePath = path.join(IMAGES_DIR, `${movieId}`);

  try {
    await fsPromises.access(imagePath, fs.constants.F_OK);
    const image = await fsPromises.readFile(imagePath);
    res.setHeader("Content-Type", "image/jpeg");
    res.statusCode = 200;
    res.end(image);
  } catch (error) {
    console.error("Error handling image request:", error);
    res.setHeader("Content-Type", "text/plain");
    res.statusCode = 404;
    res.end("Image not found");
  }
};

// Инициализация данных
const init = async () => {
  try {
    await createImagesDir();
    filmsData = await dataReader(); // Загрузка данных о фильмах и изображениях
  } catch (error) {
    console.error("Initialization failed:", error);
  }
};

// Обработка запроса на получение информации о фильме по ID
const handleMovieRequest = (id, res) => {
  try {
    const film = filmsData.find((film) => film.id === id) || null;
    if (film) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(film));
    } else {
      res.statusCode = 404;
      res.end("Film not found");
    }
  } catch (error) {
    console.error("Error handling movie request:", error);
    res.statusCode = 500;
    res.end("Server error");
  }
};

// Обработка запроса на поиск фильмов
const handleSearchRequest = (query, res) => {
  try {
    const title = query.get("title");
    const page = parseInt(query.get("page"), 10) || 1;
    if (!title) {
      throw new Error("Title parameter is required");
    }
    const searchTerm = title.toLowerCase();
    const filteredMovies = filmsData.filter((film) =>
      film.title.toLowerCase().includes(searchTerm)
    );
    const startIndex = (page - 1) * 10;
    const paginatedMovies = filteredMovies.slice(startIndex, startIndex + 10);
    const searchResponse = {
      search_result: paginatedMovies,
    };

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(searchResponse));
  } catch (error) {
    console.error("Error handling search request:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Server error");
  }
};

// Обработка запроса на эхо
const handleEchoRequest = (res, req) => {
  res.statusCode = 200;
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    res.setHeader("Content-Type", "text/plain");
    res.end(body);
  });
};

// Обработка запроса на пинг
const handlePingRequest = (res) => {
  res.statusCode = 200;
  res.end();
};

// Обработка некорректных запросов
const handleNotFoundRequest = (res) => {
  res.statusCode = 404;
  res.end();
};

// Обработка запросов на сервер
const requestHandler = (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (pathname === "/echo" && method === "POST") {
    handleEchoRequest(res, req);
  } else if (pathname === "/ping") {
    handlePingRequest(res);
  } else if (pathname.startsWith("/api/v1/movie/") && method === "GET") {
    const id = pathname.split("/")[4];
    handleMovieRequest(id, res);
  } else if (pathname.startsWith("/api/v1/search") && method === "GET") {
    handleSearchRequest(parsedUrl.searchParams, res);
  } else if (pathname.startsWith("/static/images/") && method === "GET") {
    handleGetImage(req, res); // Обработка запросов на получение изображений
  } else {
    handleNotFoundRequest(res);
  }
};

// Создание сервера
const server = http.createServer(requestHandler);

// Запуск асинхронной инициализации

init()
  .then(() => {
    // Запуск сервера после инициализации
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Initialization error:", error);
  });
