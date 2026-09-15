'use strict'

declare var config: {
  root: string
  search: {
    preload: boolean
    activeHolder: string
    blurHolder: string
    noResult: string
  }
}
declare function getElement(selector: string, item?: Element): HTMLElement
declare function format(format: string, ...args: any[]): string
declare var header: { close(): void }
declare var pjax: { refresh(element: Element): void } | undefined

interface WordHit {
  position: number
  word: string
}

interface SliceHit {
  position: number
  length: number
}

interface Slice {
  hits: SliceHit[]
  start: number
  end: number
  TextCount: number
}

interface ResultItem {
  item: string
  TextCount: number
  TitleCount: number
  ContentCount: number
  id: number
}

(() => {
  let fetched = false, fetching = false, waiting = false
  let datas: any[] = []
  const path = config.root + 'search.json'
  const input = getElement('#search-input') as HTMLInputElement
  const topbar = getElement('header')
  const searchHeader = document.querySelector('#search-header')
  const searchBtn = document.querySelector('.searchBtn') as HTMLButtonElement | null
  const activeHolder = config.search.activeHolder
  const blurHolder = config.search.blurHolder
  const noResult = config.search.noResult
  const popup = getElement('.search-popup')
  function fetechData() {
    fetching = true
    fetch(path)
      .then(response => response.text())
      .then(res => {
        fetched = true
        datas = JSON.parse(res)
        if (waiting === true) {
          inputEventFunction()
        }
      }).catch(() => fetching = false)
  }
  if (config.search.preload) {
    fetechData()
  }
  function getIndexByWord(word: string, text: string, caseSensitive: boolean) {
    const wordLen = word.length
    if (wordLen === 0) {
      return []
    }
    let startPosition = 0
    let position = -1
    let index: WordHit[] = []
    if (!caseSensitive) {
      text = text.toLowerCase()
      word = word.toLowerCase()
    }
    while ((position = text.indexOf(word, startPosition)) > -1) {
      index.push({
        position: position,
        word: word
      })
      startPosition = position + wordLen
    }
    return index
  }
  function mergeIntoSlice(start: number, end: number, index: WordHit[], searchText: string): Slice {
    let item = index[index.length - 1]
    let position = item.position
    let word = item.word
    const hits: SliceHit[] = []
    let searchTextCountInSlice = 0
    while (position + word.length <= end && index.length !== 0) {
      if (word === searchText) {
        searchTextCountInSlice++
      }
      hits.push({
        position: position,
        length: word.length
      })
      const wordEnd = position + word.length
      index.pop()
      while (index.length !== 0) {
        item = index[index.length - 1]
        position = item.position
        word = item.word
        if (wordEnd > position) {
          index.pop()
        } else {
          break
        }
      }
    }
    return {
      hits: hits,
      start: start,
      end: end,
      TextCount: searchTextCountInSlice
    }
  }
  function highlightKeyword(text: string, slice: Slice) {
    let result = ''
    let prevEnd = slice.start
    slice.hits.forEach(hit => {
      result += text.substring(prevEnd, hit.position)
      const end = hit.position + hit.length
      result += `<nobr class="search-keyword">${text.substring(hit.position, end)}</nobr>`
      prevEnd = end
    })
    result += text.substring(prevEnd, slice.end)
    return result
  }
  function inLoading() {
    getElement('#search-result').innerHTML = '<div id="loading"><div><p>Loading...</p></div></div>'
  }
  function onPopupClose() {
    getElement('#search-result').querySelectorAll('a').
      forEach((item) => item.setAttribute('tabindex', '-1'))
    document.body.classList.remove('blur')
    popup.classList.remove('open')
  }
  function proceedSearch() {
    document.body.classList.add('blur')
    getElement('#search-result').removeAttribute('tabindex')
    popup.classList.add('open')
    if (fetched === true) {
      popup.innerHTML = "<div id='search-result'></div>"
      document.getElementById('search-result')!.innerHTML = ''
    } else {
      inLoading()
    }
  }
  function inputEventFunction() {
    const searchText = input.value.trim().toLowerCase()
    if (!searchText.length) {
      input.placeholder = activeHolder
      onPopupClose()
      return
    }
    proceedSearch()
    if (fetched === false) {
      return
    }
    const keywords = searchText.split(/[-\s]+/)
    if (keywords.length > 1) {
      keywords.push(searchText)
    }
    const resultItems: ResultItem[] = []
    if (searchText.length > 0) {
      datas.forEach(data => {
        if (!data.title) {
          return
        }
        let TextCount = 0, TitleCount = 0, ContentCount = 0
        const title = data.title.trim()
        const titleInLowerCase = title.toLowerCase()
        const content = data.content ? data.content.trim().replace(/<[^>]+>/g, '') : ''
        const contentInLowerCase = content.toLowerCase()
        const articleUrl = decodeURIComponent(data.url).replace(/\/{2,}/g, '/')
        let indexOfTitle: WordHit[] = []
        let indexOfContent: WordHit[] = []
        keywords.forEach(keyword => {
          const hitInTitle = getIndexByWord(keyword, titleInLowerCase, false)
          const hitInContent = getIndexByWord(keyword, contentInLowerCase, false)
          indexOfTitle = indexOfTitle.concat(hitInTitle)
          indexOfContent = indexOfContent.concat(hitInContent)
          if (hitInTitle.length > 0 || hitInContent.length > 0) {
            TextCount++
          }
          if (hitInTitle.length > 0) {
            TitleCount++
          }
          if (hitInTitle.length > 0 || hitInContent.length > 0) {
            ContentCount++
          }
        })
        if (indexOfTitle.length > 0 || indexOfContent.length > 0) {
          [indexOfTitle, indexOfContent].forEach(index => {
            index.sort((itemLeft, itemRight) => {
              if (itemRight.position !== itemLeft.position) {
                return itemRight.position - itemLeft.position
              }
              return itemLeft.word.length - itemRight.word.length
            })
          })

          const slicesOfTitle: Slice[] = []
          if (indexOfTitle.length !== 0) {
            const tmp = mergeIntoSlice(0, title.length, indexOfTitle, searchText)
            slicesOfTitle.push(tmp)
          }
          let resultItem = ''
          if (slicesOfTitle.length !== 0) {
            resultItem += `<a href="${articleUrl}" class="recent-post"><b class="search-result-title">${highlightKeyword(title, slicesOfTitle[0])}</b>`
          } else {
            resultItem += `<a href="${articleUrl}" class="recent-post"><b class="search-result-title">${title}</b>`
          }
          if (indexOfContent !== null && indexOfContent.length !== 0) {
            const item = indexOfContent[indexOfContent.length - 1]
            const position = item.position
            const word = item.word
            let start = position - 20
            let end = position + 80
            if (start < 0) {
              start = 0
            }
            if (end < position + word.length) {
              end = position + word.length
            }
            if (end > content.length) {
              end = content.length
            }
            const tmp = mergeIntoSlice(start, end, indexOfContent, searchText)
            resultItem += `<p class="search-result">${highlightKeyword(content, tmp)}...</p>`
          } else {
            resultItem += `<p class="search-result">${content}...</p>`
          }
          resultItem += '</a>'
          resultItems.push({
            item: resultItem,
            TextCount: TextCount,
            TitleCount: TitleCount,
            ContentCount: ContentCount,
            id: resultItems.length
          })
        }
      })
    }
    popup.scroll({ top: 0, left: 0 })
    const resultList = getElement('#search-result')
    if (resultItems.length === 0) {
      resultList.innerHTML =
        `<div id="no-result"><p>${format(noResult, `<b>${input.value}</b>`)}</p></div>`
    } else {
      resultItems.sort((Left, Right) => {
        if (Left.TextCount !== Right.TextCount) {
          return Right.TextCount - Left.TextCount
        } else if (Left.TitleCount !== Right.TitleCount) {
          return Right.TitleCount - Left.TitleCount
        } else if (Left.ContentCount !== Right.ContentCount) {
          return Right.ContentCount - Left.ContentCount
        }
        return Right.id - Left.id
      })
      let searchResultList = ""
      resultItems.forEach(result => {
        searchResultList += result.item
      })
      resultList.innerHTML = searchResultList
    }
    if (typeof pjax !== 'undefined') {
      pjax.refresh(resultList)
    }
  }
  input.addEventListener('keypress', event => {
    if (event.key === 'Enter') {
      inputEventFunction()
    }
  })
  // 打开搜索：展开搜索行、按需加载数据（移动端搜索行默认 visibility:hidden，须先展开再聚焦）；打开前关菜单（两面板互斥）
  // focusInput 供图标 / 快捷键路径使用；输入框聚焦（focus 事件）路径传 false，避免重复聚焦
  function openSearch(focusInput: boolean) {
    header.close()
    topbar.classList.add('search-open')
    input.placeholder = activeHolder
    if (!fetched) {
      if (!fetching) {
        fetechData()
      }
      waiting = true
    }
    if (focusInput) {
      input.focus()
    }
  }
  function EscapeSearch() {
    if (!topbar.classList.contains('search-open')) {
      return
    }
    topbar.classList.remove('search-open')
    onPopupClose()
    input.value = ''
    input.placeholder = blurHolder
    waiting = false
    input.blur()
  }
  input.addEventListener('keyup', () => {
    inputEventFunction()
  })
  input.addEventListener('focus', () => {
    openSearch(false)
  })
  // 点按搜索图标（含按钮内 SVG）应保持输入：作为 blur / focusout 的豁免目标，不触发 EscapeSearch
  function isSearchBtnTarget(target: EventTarget | null): boolean {
    return target !== null && searchBtn !== null &&
      (target === searchBtn ||
        (target instanceof Element && target.closest('.searchBtn') === searchBtn))
  }
  input.addEventListener('blur', (event: FocusEvent) => {
    if (isSearchBtnTarget(event.relatedTarget)) {
      return
    }
    if (!event.relatedTarget ||
      (event.relatedTarget as Element).parentElement !== getElement('#search-result')) {
      EscapeSearch()
    }
  })
  popup.addEventListener('focusout', (event: FocusEvent) => {
    if (isSearchBtnTarget(event.relatedTarget)) {
      return
    }
    if (!event.relatedTarget ||
      (event.relatedTarget !== input &&
        (event.relatedTarget as Element).parentElement !== getElement('#search-result'))) {
      EscapeSearch()
    }
  })
  if (searchBtn !== null) {
    searchBtn.addEventListener('click', () => {
      openSearch(true)
    })
  }
  // 点击搜索框整行 / 放大镜区域聚焦输入框
  if (searchHeader !== null) {
    searchHeader.addEventListener('click', () => {
      input.focus()
    })
  }
  document.addEventListener('pjax:send', () => {
    EscapeSearch()
  })
  document.addEventListener('keyup', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      EscapeSearch()
    } else if (event.key === 'f' &&
      !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
      openSearch(true)
    }
  })
  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'A' ||
      (target.parentElement !== null && target.parentElement.tagName === 'A')) {
      EscapeSearch()
    }
  })
})()
