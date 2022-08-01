import detectEthereumProvider from "@metamask/detect-provider"
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import { providers, Contract, utils } from "ethers"
import Head from "next/head"
import React from "react"
import styles from "../styles/Home.module.css"
import { useFormik } from "formik"
import * as yup from 'yup'
import { TextField, Button } from '@material-ui/core'

//yup validation schema
const validationSchema = yup.object({
    name: yup.string().required("name is required"),
    age: yup.number().positive("has to be positive integer").integer("has to be positive integer").required("age is required"),
    address: yup.string().required("address is required")
})

export default function Home() {
    const [logs, setLogs] = React.useState("Connect your wallet and greet!")

    const [userData, setUserData] = React.useState("");

    const [greetEvent, setGreetEvent] = React.useState(false);

    const [greetEventText, setGreetEventText] = React.useState("");

    async function greet() {
        setLogs("Creating your Semaphore identity...")

        const provider = (await detectEthereumProvider()) as any

        await provider.request({ method: "eth_requestAccounts" })

        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage(userData)

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        setLogs("Creating your Semaphore proof...")

        const greeting = "Hello world"

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
            greeting
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof)

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status === 500) {
            const errorMessage = await response.text()

            setLogs(errorMessage)
        } else {
            setLogs("Your anonymous greeting is onchain :)")
        }
    }
    //formik code
    const formik = useFormik({
        initialValues: {
            name: "",
            age: "",
            address: "",
        },
        onSubmit: (values) => {
            console.log(JSON.stringify(values)) //assignment requirement
            setUserData(JSON.stringify(values))
        },
        validationSchema: validationSchema
    })

    //Event logger
    const checkEvents = async () => {
        const greetersArtifact = require("../artifacts/contracts/Greeters.sol/Greeters.json")
        const abi = greetersArtifact.abi
        const contractAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"

        const provider = (await detectEthereumProvider()) as any
        await provider.request({ method: "eth_requestAccounts" })
        const ethersProvider = new providers.Web3Provider(provider)

        let contract = new Contract(contractAddress, abi, ethersProvider)

        contract.on("NewGreeting", (_greeting) => {
            setGreetEvent(true)
            const _greetingString = utils.parseBytes32String(_greeting)
            setGreetEventText(_greetingString)
        })
    }

    return (
        <div className={styles.container}>
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={styles.main}>
                <h1 className={styles.title}>Greetings</h1>

                <p className={styles.description}>A simple Next.js/Hardhat privacy application with Semaphore.</p>
                <form className={styles.form} onSubmit={formik.handleSubmit}>
                    <TextField
                        style={{ width: '32rem' }}
                        id="name"
                        name="name"
                        label="Name"
                        margin="normal"
                        variant="outlined"
                        value={formik.values.name}
                        onChange={formik.handleChange}
                        error={formik.touched.name && Boolean(formik.errors.name)}
                        helperText={formik.touched.name && formik.errors.name}
                        onBlur={formik.handleBlur}
                    >

                    </TextField>
                    <TextField
                        style={{ width: '32rem' }}
                        id="age"
                        name="age"
                        label="Age"
                        margin="normal"
                        variant="outlined"
                        value={formik.values.age}
                        onChange={formik.handleChange}
                        error={formik.touched.age && Boolean(formik.errors.age)}
                        helperText={formik.touched.age && formik.errors.age}
                        onBlur={formik.handleBlur}>
                    </TextField>
                    <TextField
                        style={{ width: '32rem' }}
                        id="address"
                        name="address"
                        label="Address"
                        margin="normal"
                        variant="outlined"
                        value={formik.values.address}
                        onChange={formik.handleChange}
                        error={formik.touched.address && Boolean(formik.errors.address)}
                        helperText={formik.touched.address && formik.errors.address}
                        onBlur={formik.handleBlur}>
                    </TextField>
                    <Button type="submit" style={{ marginTop: '.7rem' }} variant="contained">Log Input</Button>
                </form>
                <div className={styles.logs}>{logs}</div>

                <div onClick={() => {
                    greet()
                    checkEvents()
                }} className={styles.button}>
                    Greet
                </div>
                <div className={styles.eventListener}>
                    {
                    greetEvent ? <p style={{color: 'green'}}>Event Catched. Greet msg: {greetEventText} </p> : <p style={{color: 'red'}}>No Event Catched</p> 
                    }
                </div>

            </main>
        </div>
    )
}
