# Docker Compose 3-Tier Todo List

Docker Compose 기반 3계층 Todo List 웹 애플리케이션입니다.
회원가입과 로그인 후 사용자별 Todo 목록을 관리할 수 있습니다.

## 주요 기능

- 회원가입
- 로그인 및 로그아웃
- 사용자별 Todo 목록 조회
- Todo 추가
- Todo 상태 변경: 할 일, 진행 중, 완료
- Todo 마감일 지정 및 지연 여부 표시
- Todo 제목과 마감일 수정
- Todo 제목 검색 및 상태별 필터링
- 사용자 프로필 이름과 이메일 수정
- 사용자 Todo 완료율 통계
- 공지사항 조회
- 월간 달력에서 마감일 기준 Todo 확인
- 달력에서 대한민국 공휴일 이름, 일요일, 토요일 색상 구분

달력은 고정 공휴일, 설날, 추석, 부처님오신날과 일반 대체공휴일 규칙을
표시합니다. 정부가 별도로 지정하는 임시공휴일은 자동 표시 대상에서 제외됩니다.
- Todo 삭제

## 폴더 구조

```text
todo-docker-project/
|-- backend/
|   |-- app.py
|   |-- Dockerfile
|   `-- requirements.txt
|-- db/
|   `-- init.sql
|-- frontend/
|   |-- app.js
|   |-- Dockerfile
|   |-- index.html
|   |-- nginx.conf
|   `-- styles.css
|-- docker-compose.yml
`-- README.md
```

## 아키텍처

```text
Web Browser
    |
    | http://localhost:8080
    v
frontend container (Nginx)
    |
    | /api requests
    v
backend container (Flask REST API)
    |
    | MySQL connection
    v
db container (MySQL)
```

브라우저는 `http://localhost:8080`으로 Nginx에 접속합니다. Nginx는 HTML,
CSS, JavaScript 파일을 제공하며 `/api` 요청을 Flask 컨테이너로 전달합니다.
Flask API는 Compose 내부 네트워크에서 `db`라는 서비스 이름으로 MySQL에
접속합니다.

## 컨테이너 역할

| 컨테이너 | 계층 | 역할 |
|---|---|---|
| `todo-frontend` | Presentation Tier | Nginx로 화면을 제공하고 API 요청을 Flask로 전달합니다. |
| `todo-backend` | Application Tier | Flask REST API로 회원 인증과 Todo 요청을 처리합니다. |
| `todo-db` | Data Tier | MySQL에 사용자 계정과 Todo 데이터를 저장합니다. |

## 인증 방식

- 회원가입 시 이름, 이메일, 아이디, 비밀번호, 비밀번호 확인을 입력합니다.
- 아이디는 3~50자의 영문, 숫자, 밑줄만 사용할 수 있습니다.
- 비밀번호는 8자 이상이며 영문과 숫자를 모두 포함해야 합니다.
- 아이디와 이메일은 중복 가입할 수 없습니다.
- 회원가입을 완료한 뒤 로그인 화면에서 직접 로그인합니다.
- `admin` 아이디는 관리자 계정으로 구분되며 로그인 후 `Admin` 배지가 표시됩니다.
- 관리자는 Todo 입력 화면 대신 회원 목록을 조회하는 사용자 관리 화면으로 이동합니다.
- 관리자는 본인 계정을 제외한 다른 회원 계정을 삭제할 수 있습니다.
- 관리자 화면에는 전체 회원, 관리자, 일반 회원, 전체 Todo 통계가 표시됩니다.
- 관리자는 공지사항을 작성, 수정, 삭제할 수 있습니다.
- 관리자는 최근 사용자 활동 로그를 확인할 수 있습니다.
- 비밀번호는 해시로 변환한 뒤 MySQL에 저장합니다.
- 로그인 또는 회원가입 성공 시 Flask API가 JWT 토큰을 반환합니다.
- 브라우저는 토큰을 저장하고 Todo API 요청의 `Authorization` 헤더에 포함합니다.
- Todo 데이터는 로그인한 사용자별로 분리됩니다.

## REST API

| Method | URL | 설명 |
|---|---|---|
| `POST` | `/api/auth/register` | 회원가입 |
| `POST` | `/api/auth/login` | 로그인 |
| `GET` | `/api/admin/users` | 관리자 전용 회원 목록 조회 |
| `GET` | `/api/admin/stats` | 관리자 전용 서비스 통계 조회 |
| `GET` | `/api/admin/activity-logs` | 관리자 전용 최근 활동 로그 조회 |
| `POST` | `/api/admin/notices` | 관리자 전용 공지사항 작성 |
| `PATCH` | `/api/admin/notices/<id>` | 관리자 전용 공지사항 수정 |
| `DELETE` | `/api/admin/notices/<id>` | 관리자 전용 공지사항 삭제 |
| `DELETE` | `/api/admin/users/<id>` | 관리자 전용 회원 계정 삭제 |
| `GET` | `/api/profile` | 로그인 사용자 프로필 조회 |
| `PATCH` | `/api/profile` | 로그인 사용자 프로필 수정 |
| `GET` | `/api/notices` | 로그인 사용자 공지사항 조회 |
| `GET` | `/api/todos` | 로그인 사용자의 Todo 목록 조회 |
| `GET` | `/api/todos/stats` | 로그인 사용자의 Todo 완료율 조회 |
| `POST` | `/api/todos` | 로그인 사용자의 Todo 추가 |
| `PATCH` | `/api/todos/<id>` | 로그인 사용자의 Todo 상태 변경 |
| `DELETE` | `/api/todos/<id>` | 로그인 사용자의 Todo 삭제 |
| `GET` | `/api/health` | API 상태 확인 |

## 빌드 및 실행

1. Docker Desktop을 실행합니다.
2. 프로젝트 최상위 폴더에서 다음 명령어를 실행합니다.

```bash
docker compose up --build -d
```

3. 브라우저에서 다음 주소를 엽니다.

```text
http://localhost:8080
```

4. 회원가입 탭에서 계정을 만든 뒤 Todo를 추가합니다.

컨테이너 상태 확인:

```bash
docker compose ps
```

로그 확인:

```bash
docker compose logs
```

애플리케이션 종료:

```bash
docker compose down
```

데이터베이스 볼륨까지 삭제하고 처음부터 다시 실행:

```bash
docker compose down -v

docker compose up --build -d
```

## MySQL 초기화

`db/init.sql` 파일은 MySQL 컨테이너가 처음 생성될 때 자동 실행됩니다.
`users` 테이블과 `todos` 테이블을 생성하며, Todo는 사용자 ID와 연결됩니다.
MySQL 데이터는 Docker의 `mysql-data` 볼륨에 저장되므로 컨테이너를 종료해도
유지됩니다.

## 샘플 데이터 생성

개발 및 시연용 계정 20개와 계정별 Todo 10개를 생성하려면 다음 명령어를
실행합니다.

```bash
docker compose exec backend python seed_demo_data.py
```

샘플 계정은 `demo_user_01`부터 `demo_user_20`까지이며 비밀번호는 모두
`qwer1234`입니다. Todo 마감일은 스크립트를 실행한 시점의 다음 달로 설정됩니다.


## 시연 영상



