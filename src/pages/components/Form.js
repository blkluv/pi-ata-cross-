import { useState } from 'react'
import styles from '@/styles/Form.module.css'
import ScaleLoader from "react-spinners/ScaleLoader"
import fireConfetti from "../../utils/confetti"
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'

const Form = () => {
  const [selectedFile, setSelectedFile] = useState()
  const [name, setName] = useState()
  const [description, setDescription] = useState()
  const [externalURL, setExternalURL] = useState()
  const [osLink, setOsLink] = useState("https://opensea.io")
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [isComplete, setIsComplete] = useState(false)

  const { address } = useAccount()

  const CONTRACT_ADDRESS = "0x7FC8e27d971d7B2eA951FCe62192F6B76dD319B7"
  const BASE_URL = "https://opensea.io/assets/base"

  const fileChangeHandler = (event) => setSelectedFile(event.target.files[0])
  const nameChangeHandler = (event) => setName(event.target.value)
  const descriptionChangeHandler = (event) => setDescription(event.target.value)
  const externalURLChangeHandler = (event) => setExternalURL(event.target.value)

  const pollForTokenId = async (mintId) => {
    const url = `https://www.crossmint.com/api/2022-06-09/collections/${process.env.NEXT_PUBLIC_CROSSMINT_COLLECTION_ID}/nfts/${mintId}`

    for (let i = 0; i < 10; i++) {
      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'x-client-secret': process.env.NEXT_PUBLIC_CROSSMINT_CLIENT_SECRET,
          'x-project-id': process.env.NEXT_PUBLIC_CROSSMINT_PROJECT_ID,
        }
      })
      const data = await res.json()
      if (data?.onChain?.status === "success" && data?.onChain?.tokenId) {
        return data
      }
      await new Promise(resolve => setTimeout(resolve, 6000))
    }

    throw new Error("Timeout polling for tokenId")
  }

  const refreshOpenSeaMetadata = async (contract, tokenId) => {
    try {
      await fetch(`https://api.opensea.io/api/v2/chain/base/contract/${contract}/nfts/${tokenId}/refresh`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          // Optional: include an API key if you have one for higher rate limits
        }
      })
    } catch (err) {
      console.warn("Failed to refresh OpenSea metadata", err)
    }
  }

  const handleSubmission = async () => {
    let key, keyId, fileCID, uri, mintId

    try {
      setIsLoading(true)

      // Step 1: Get Pinata Key
      const keyRes = await fetch("/api/key")
      const keyData = await keyRes.json()
      key = keyData.JWT
      keyId = keyData.pinata_api_key

      // Step 2: Upload file
      const formData = new FormData()
      formData.append('file', selectedFile, { filepath: selectedFile.name })
      formData.append('pinataMetadata', JSON.stringify({ name: selectedFile.name }))
      formData.append('pinataOptions', JSON.stringify({ cidVersion: 0 }))
      setMessage("Uploading File...")

      const fileRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: formData
      })
      const fileResJson = await fileRes.json()
      fileCID = fileResJson.IpfsHash

      // Step 3: Upload metadata
      const jsonData = JSON.stringify({
        name,
        description,
        image: `${process.env.NEXT_PUBLIC_PINATA_DEDICATED_GATEWAY}${fileCID}`,
        external_url: externalURL
      })
      setMessage("Uploading Metadata...")

      const metadataRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: jsonData
      })
      const metadataJson = await metadataRes.json()
      uri = metadataJson.IpfsHash

      // Step 4: Mint NFT
      setMessage("Minting NFT...")
      const mintBody = JSON.stringify({
        address,
        uri: `${process.env.NEXT_PUBLIC_PINATA_DEDICATED_GATEWAY}${uri}`,
      })
      const mintRes = await fetch("/api/mint", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: mintBody
      })
      const mintData = await mintRes.json()
      mintId = mintData.id

      // Step 5: Poll for Token ID
      setMessage("Waiting for Token ID...")
      const minted = await pollForTokenId(mintId)
      const tokenId = minted.onChain.tokenId
      const osURL = `${BASE_URL}/${CONTRACT_ADDRESS}/${tokenId}`
      setOsLink(osURL)

      // Step 6: Refresh metadata on OpenSea
      setMessage("Refreshing metadata...")
      await refreshOpenSeaMetadata(CONTRACT_ADDRESS, tokenId)

      // Step 7: Delete temp key
      await fetch("/api/key", {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyId })
      })

      // Success!
      setMessage("Minting Complete!")
      setIsLoading(false)
      setIsComplete(true)
      fireConfetti()

    } catch (error) {
      console.error("Error during submission:", error)
      setIsLoading(false)
      setIsComplete(false)
      alert("Error Minting NFT")
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.button}><ConnectButton /></div>

      {!isLoading && !isComplete && (
        <>
          <label className={styles.formInput} onChange={fileChangeHandler} htmlFor="file">
            <input type="file" id="file" hidden />
            <p>{!selectedFile ? "Select File" : selectedFile.name}</p>
          </label>

          <label>Name</label>
          <input type='text' placeholder='Jersey Club Rizz' onChange={nameChangeHandler} />

          <label>Description</label>
          <input type='text' placeholder='Giving Energy' onChange={descriptionChangeHandler} />

          <label>Your Website</label>
          <input type='text' placeholder='https://pinata.cloud' onChange={externalURLChangeHandler} />

          <button onClick={handleSubmission}>Submit</button>
        </>
      )}

      {isLoading && (
        <div className={styles.form}>
          <ScaleLoader color="#6D57FF" height="150px" width="15px" />
          <h2>{message}</h2>
        </div>
      )}

      {isComplete && (
        <div className={styles.form}>
          <h4>{message}</h4>
          <a href={osLink} target="_blank" className={styles.link} rel="noreferrer">
            <h3>Link to NFT</h3>
          </a>
          <button onClick={() => setIsComplete(false)} className={styles.logout}>Mint Another Jersey Club Record</button>
        </div>
      )}
    </div>
  )
}

export default Form
