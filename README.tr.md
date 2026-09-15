# depstory

[![CI](https://github.com/Razalpha/depstory/actions/workflows/ci.yml/badge.svg)](https://github.com/Razalpha/depstory/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933)](package.json)
[![MIT lisansı](https://img.shields.io/badge/lisans-MIT-blue.svg)](LICENSE)

`package.json` bir projenin hangi paketlere bağlı olduğunu gösterir. `depstory`
ise Git geçmişiyle güncel importları bir araya getirerek paketin ne zaman
eklendiğini, o commit'in ne söylediğini ve bugün hangi dosyalarda kullanıldığını
gösterir.

[Web sitesi](https://razalpha.github.io/depstory/) · [GitHub Marketplace](https://github.com/marketplace/actions/dependency-change-report) · [English README](README.md)

```text
$ npx --yes github:Razalpha/depstory zod

demo-api — 1 dependency declaration across 1 manifest

zod ^4.0.0 (dependencies)
  introduced 2026-09-14 in 68d9f4a1: validate incoming requests
  resolved 4.1.5 via package-lock.json
  used by 2 file(s): src/api.ts, src/schema.ts
```

Bu komut, tanımadığınız bir depoyu incelerken, bir paketin kaldırılıp
kaldırılamayacağını araştırırken veya sürüm yükseltmeden önce paketin eklenme
gerekçesini bulurken işe yarar. Depoyu olduğu yerde ve salt okunur biçimde
inceler; bağımlılık kurmaz, proje kodunu çalıştırmaz.

## Çalıştırma

Node.js 20 veya daha yenisi ile Git gerekir. Paket şimdilik doğrudan bu depodan
çalıştırılır:

```bash
npx --yes github:Razalpha/depstory
npx --yes github:Razalpha/depstory react
npx --yes github:Razalpha/depstory --workspace packages/web
npx --yes github:Razalpha/depstory --markdown
npx --yes github:Razalpha/depstory --json
npx --yes github:Razalpha/depstory zod --cwd ../baska-proje
npx --yes github:Razalpha/depstory diff origin/main...HEAD --markdown
```

Sık kullanım için:

```bash
npm install --global github:Razalpha/depstory
depstory --help
```

## İki Git sürümünü karşılaştırma

`diff`, iki sürüm arasında checkout yapmadan hem bağımlılık kayıtlarını hem de
kilit dosyasındaki çözümlenmiş sürümleri karşılaştırır:

```bash
depstory diff origin/main...HEAD
depstory diff v0.2.0..HEAD --json
depstory diff origin/main...HEAD --workspace packages/web --markdown
depstory diff origin/main...HEAD --html > dependency-report.html
```

İki nokta verilen iki ucu doğrudan karşılaştırır. Üç nokta merge-base'i kullanır
ve pull request incelemeleri için daha uygundur. Her değişiklik; kayıtlı ve
çözümlenmiş sürüm geçişini, güncel kaynak ve yapılandırma referanslarını, eklenme
commit'ini, commit mesajında yer alıyorsa ilgili PR veya kapanan issue bağlantısını
ve manifest farkını içerir.

HTML raporu tek dosyadır; uzak betik, yazı tipi, görsel veya çalışma zamanı isteği
kullanmaz. Karşılaştırma alanlarının tamamı
[docs/diff-output.md](docs/diff-output.md) içinde açıklanır.

## Ne gösterir?

depstory; `dependencies`, `devDependencies`, `peerDependencies` ve
`optionalDependencies` bölümlerindeki her kayıt için:

1. ilgili `package.json` geçmişinde paket adını ekleyen ilk commit'i arar;
2. JavaScript, TypeScript, Vue ve Svelte dosyalarındaki doğrudan ESM, dinamik
   import, yeniden dışa aktarma ve CommonJS kullanımlarını tarar;
3. tanınan yapılandırma dosyalarını ve paket betiklerini kontrol eder;
4. npm, Yarn veya pnpm kilit dosyasından çözümlenmiş sürümü okur;
5. bulguları terminal metni, Markdown veya sürümlü JSON olarak verir.

Kaynak dosyalar her çalıştırmada bir kez taranır. Yorumlar, sıradan metinler,
şablon metinleri, derleme çıktıları, bağımlılık klasörleri, sembolik bağlantılar
ve 1 MiB'tan büyük dosyalar atlanır.

Kök manifestte `packageManager` alanı varsa kilit dosyası buna göre seçilir. Bu
alan yoksa sırasıyla `package-lock.json`, `pnpm-lock.yaml` ve `yarn.lock` aranır.
npm kilit dosyası 1–3, Yarn classic/Berry seçicileri ve importer tabanlı pnpm
kilit dosyaları desteklenir.

## Monorepo desteği

Kök `package.json` içindeki `*`, `**`, `?` ve hariç tutma ifadelerini kullanan
yaygın workspace desenleri otomatik bulunur. Hem dizi biçimi hem de
`workspaces.packages` biçimi desteklenir. Raporu paket adına veya depo içindeki
göreli yoluna göre daraltabilirsiniz:

```bash
depstory --workspace @acme/web
depstory react --workspace packages/web
```

Kullanım dosyaları seçilen workspace ile sınırlandırılır. Kök bağımlılıklar ortak
betikler ve araçlar tarafından kullanılabileceği için tüm depoda aranır.

## Sonucu yorumlarken

Rapor bir karar değil, inceleme kanıtıdır. Doğrudan import bulunmaması paketin
kesinlikle kullanılmadığı anlamına gelmez; komut satırı araçları, yükleyiciler,
framework eklentileri ve yapılandırma dosyaları kaynak importlarında görünmeyebilir.
Sığ klonlarda ilk commit bulunmayabilir; depstory bu durumu çıktıda açıkça belirtir.

Git taraması manifestin bugünkü yolunu izler. Manifestin adı veya yeri değiştiyse
bu değişiklikten daha eski kayıtlar için Git üzerinde ayrıca inceleme gerekebilir.

JSON alanları ve uyumluluk kuralları [docs/json-output.md](docs/json-output.md)
dosyasında açıklanır.

## Pull request raporları

Depodaki salt okunur composite action, karşılaştırmayı GitHub Actions iş özetine
yazar. Hedef projenin bağımlılıklarını kurmaz ve depo kodunu çalıştırmaz. Bir
projeye eklemek için [docs/github-action.md](docs/github-action.md) içindeki
workflow örneğini kullanabilirsiniz. Adım ayrıca sonraki workflow adımları için
değişiklik sayılarını ve `has-changes` değerini üretir.

## Geliştirme

```bash
npm run check
npm test
npm run coverage
npm pack --dry-run
```

Çalışma zamanı bağımlılığı yoktur ve testler ağ bağlantısı istemez. Ayrıştırıcıya
yeni davranış eklerken eksik sözdizimini gösteren küçük bir fixture da ekleyin.
Ayrıntılı akış için [CONTRIBUTING.md](CONTRIBUTING.md), katkıya açık işler için
[ROADMAP.md](ROADMAP.md) dosyasına bakın.

## Lisans

[MIT](LICENSE)
